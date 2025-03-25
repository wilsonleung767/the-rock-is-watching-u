// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";

// Error threshold that triggers the "error mode"
const ERROR_THRESHOLD = 3;

// Track our current state
let currentPanel: vscode.WebviewPanel | undefined = undefined;
let isInErrorMode = false;
let userInteracted = false; // Track if user has interacted with the panel
let typingTimer: NodeJS.Timeout | undefined; // Timer to track when typing stops

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log(
    'Congratulations, your extension "the-rock-is-watching-u" is now active!'
  );
  // The command has been defined in the package.json file
  // Now provide the implementation of the command with registerCommand
  // The commandId parameter must match the command field in package.json
  const disposable = vscode.commands.registerCommand(
    "the-rock-watching-u.helloWorld",
    () => {
      // The code you place here will be executed every time your command is executed
      // Display a message box to the user
      vscode.window.showInformationMessage(
        "Hello World from The Rock Is Watching U!"
      );
    }
  );

  // Register the command to show the video panel
  const showVideoCommand = vscode.commands.registerCommand(
    "the-rock-watching-u.showVideo",
    () => {
      createOrShowPanel(context);
    }
  );

  // Setup diagnostic collection to track errors
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("theRockWatchingU");

  // Listen for document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateErrorStatus(event.document, diagnosticCollection, context);

      // Reset typing timer when user types
      if (typingTimer) {
        clearTimeout(typingTimer);
      }

      // Set a timer to enable sound after user stops typing for 2 seconds
      typingTimer = setTimeout(() => {
        if (!userInteracted) {
          userInteracted = true;
          if (currentPanel) {
            updatePanelContent(context, isInErrorMode);
          }
        }
      }, 2000);
    }),

    // Listen for save events to enable sound
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!userInteracted) {
        userInteracted = true;
        if (currentPanel) {
          updatePanelContent(context, isInErrorMode);
        }
      }
    }),

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateErrorStatus(editor.document, diagnosticCollection, context);
      }
    }),

    showVideoCommand,
    diagnosticCollection,
    disposable
  );

  // If we already have an active editor, check it for errors
  if (vscode.window.activeTextEditor) {
    updateErrorStatus(
      vscode.window.activeTextEditor.document,
      diagnosticCollection,
      context
    );
  }

  // Start the panel automatically when extension activates
  createOrShowPanel(context);
}

// Create or show the webview panel
function createOrShowPanel(context: vscode.ExtensionContext) {
  const columnToShowIn = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined;

  if (currentPanel) {
    // If we already have a panel, show it in the target column
    currentPanel.reveal(columnToShowIn);
    return;
  }

  // Create a new panel
  currentPanel = vscode.window.createWebviewPanel(
    "theRockWatchingU",
    "The Rock Watching U",
    columnToShowIn || vscode.ViewColumn.Two,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, "media")),
      ],
    }
  );

  // Set the initial HTML content
  updatePanelContent(context, false);

  // Handle panel disposal
  currentPanel.onDidDispose(
    () => {
      currentPanel = undefined;
    },
    null,
    context.subscriptions
  );
}

// Update the error status for the current document
async function updateErrorStatus(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
  context: vscode.ExtensionContext
) {
  // Get diagnostics for the current file
  const diagnostics = await vscode.languages.getDiagnostics(document.uri);

  // Filter to only errors (not warnings)
  const errors = diagnostics.filter(
    (d) => d.severity === vscode.DiagnosticSeverity.Error
  );

  // Check if we've exceeded the threshold
  const shouldBeInErrorMode = errors.length >= ERROR_THRESHOLD;

  // Play sound when transitioning to error mode
  const stateChanged = shouldBeInErrorMode !== isInErrorMode;
  if (stateChanged && shouldBeInErrorMode) {
    playErrorSound(context);
  }

  // Update if our state changed or to refresh error count
  if (stateChanged || currentPanel) {
    isInErrorMode = shouldBeInErrorMode;
    if (currentPanel) {
      updatePanelContent(context, isInErrorMode);
    }
  }
}

// Update the webview panel content
function updatePanelContent(
  context: vscode.ExtensionContext,
  isError: boolean
) {
  if (!currentPanel) return;

  // Get paths to media files
  const defaultVideoPath = vscode.Uri.file(
    path.join(context.extensionPath, "media", "defaultTheRock.mp4")
  );
  const errorVideoPath = vscode.Uri.file(
    path.join(context.extensionPath, "media", "errorTheRock.mp4")
  );
  const errorSoundPath = vscode.Uri.file(
    path.join(context.extensionPath, "media", "ohHellNo.mp3")
  );

  // Convert to webview URIs
  const defaultVideoSrc = currentPanel.webview.asWebviewUri(defaultVideoPath);
  const errorVideoSrc = currentPanel.webview.asWebviewUri(errorVideoPath);
  const errorSoundSrc = currentPanel.webview.asWebviewUri(errorSoundPath);

  // Get the error count from the current document
  let errorCount = 0;
  if (vscode.window.activeTextEditor) {
    const diagnostics = vscode.languages.getDiagnostics(
      vscode.window.activeTextEditor.document.uri
    );
    errorCount = diagnostics.filter(
      (d) => d.severity === vscode.DiagnosticSeverity.Error
    ).length;
  }

  // Generate the HTML
  currentPanel.webview.html = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>The Rock Watching U</title>
		<style>
			body {
				display: flex;
				flex-direction: column;
				justify-content: center;
				align-items: center;
				height: 100vh;
				margin: 0;
				background-color: #1e1e1e;
				color: white;
				font-family: Arial, sans-serif;
			}
			video {
				max-width: 100%;
				max-height: 80%;
			}
			.error-counter {
				margin-top: 20px;
				font-size: 28px;
				font-weight: bold;
				color: ${isError ? "#ff4444" : "#ffffff"};
			}
			.container {
				position: relative;
				display: flex;
				justify-content: center;
				align-items: center;
			}
		</style>
	</head>
	<body>
		<div class="container">
			<video id="videoPlayer" autoplay loop muted ${isError ? "hidden" : ""}>
				<source src="${defaultVideoSrc}" type="video/mp4">
			</video>
			
			<video id="errorVideoPlayer" autoplay loop muted ${isError ? "" : "hidden"}>
				<source src="${errorVideoSrc}" type="video/mp4">
			</video>
		</div>
		
		<audio id="errorSound" loop>
			<source src="${errorSoundSrc}" type="audio/mp3">
		</audio>
		
		<div class="error-counter">
			${errorCount} Error
		</div>
		
		<script>
			const videoPlayer = document.getElementById('videoPlayer');
			const errorVideoPlayer = document.getElementById('errorVideoPlayer');
			const errorSound = document.getElementById('errorSound');
			
			// Set initial state
			videoPlayer.hidden = ${isError};
			errorVideoPlayer.hidden = ${!isError};
			
			// Ensure videos are always muted
			videoPlayer.muted = true;
			errorVideoPlayer.muted = true;
			
			// Play the appropriate media based on current error state
			function playMedia() {
				if (${isError}) {
					errorVideoPlayer.play().catch(e => console.error("Error video play error:", e));
					// We play sound separately when threshold is initially exceeded via message
					// but we'll also ensure it's playing in error mode
					errorSound.play().catch(e => console.error("Error sound play error:", e));
				} else {
					videoPlayer.play().catch(e => console.error("Default video play error:", e));
					errorSound.pause();
					errorSound.currentTime = 0;
				}
			}
			
			// Start playback
			playMedia();
			
			// Handle when videos end to ensure they continue playing
			videoPlayer.addEventListener('ended', () => {
				videoPlayer.currentTime = 0;
				videoPlayer.play().catch(e => console.error("Replay error:", e));
			});
			
			errorVideoPlayer.addEventListener('ended', () => {
				errorVideoPlayer.currentTime = 0;
				errorVideoPlayer.play().catch(e => console.error("Error replay error:", e));
			});
			
			// Listen for messages from the extension
			window.addEventListener('message', event => {
				const message = event.data;
				
				// Play error sound when errors exceed threshold
				if (message.command === 'playErrorSound') {
					console.log("Playing error sound due to threshold exceeded");
					errorSound.currentTime = 0; // Reset to beginning
					errorSound.play().catch(e => console.error("Error sound play error:", e));
				}
			});
		</script>
	</body>
	</html>`;
}

function playErrorSound(context: vscode.ExtensionContext) {
  const soundPath = path.join(context.extensionPath, "media", "ohHellNo.mp3");

  // Platform-specific commands
  let command: string;
  let args: string[];

  switch (process.platform) {
    case "win32":
      command = "powershell";
      args = [
        "-c",
        `(New-Object System.Media.SoundPlayer '${soundPath}').PlaySync()`,
      ];
      break;
    case "darwin": // macOS
      command = "afplay";
      args = [soundPath];
      break;
    case "linux":
      command = "play";
      args = [soundPath];
      break;
    default:
      console.error(`Unsupported platform: ${process.platform}`);
      return;
  }

  try {
    cp.spawn(command, args);
  } catch (error) {
    console.error("Failed to play sound:", error);
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
