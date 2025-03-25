// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as path from "path";
import * as cp from "child_process";

// Error threshold that triggers the "error mode"
const ERROR_THRESHOLD = 3;

// Track our current state
let isInErrorMode = false;
let userInteracted = false; // Track if user has interacted with the panel
let typingTimer: NodeJS.Timeout | undefined; // Timer to track when typing stops

// Create a WebviewViewProvider for the side bar view
class TheRockViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "the-rock-watching-u.sideBarView";
  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;

  constructor(private readonly context: vscode.ExtensionContext) {
    this._context = context;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, "media")),
      ],
    };

    // Set initial content
    this.updateContent(false);

    // Make the view retain state when hidden
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateContent(isInErrorMode);
      }
    });
  }

  // Update the webview content
  public updateContent(isError: boolean) {
    if (!this._view) return;

    // Get paths to media files
    const defaultVideoPath = vscode.Uri.file(
      path.join(this._context.extensionPath, "media", "defaultTheRock.mp4")
    );
    const errorVideoPath = vscode.Uri.file(
      path.join(this._context.extensionPath, "media", "errorTheRock.mp4")
    );
    const errorSoundPath = vscode.Uri.file(
      path.join(this._context.extensionPath, "media", "ohHellNo.mp3")
    );

    // Convert to webview URIs
    const defaultVideoSrc = this._view.webview.asWebviewUri(defaultVideoPath);
    const errorVideoSrc = this._view.webview.asWebviewUri(errorVideoPath);
    const errorSoundSrc = this._view.webview.asWebviewUri(errorSoundPath);

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
    this._view.webview.html = `<!DOCTYPE html>
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
          background-color: transparent;
          color: white;
          font-family: Arial, sans-serif;
        }
        video {
          max-width: 100%;
          max-height: 80%;
        }
        .error-counter {
          margin-top: 5px;
          font-size: 18px;
          font-weight: bold;
          color: ${isError ? "#ff4444" : "#ffffff"};
        }
        .container {
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <video id="videoPlayer" autoplay loop muted ${isError ? "hidden" : ""}>
          <source src="${defaultVideoSrc}" type="video/mp4">
        </video>
        
        <video id="errorVideoPlayer" autoplay loop muted ${
          isError ? "" : "hidden"
        }>
          <source src="${errorVideoSrc}" type="video/mp4">
        </video>
      </div>
      
      <audio id="errorSound" loop>
        <source src="${errorSoundSrc}" type="audio/mp3">
      </audio>
      
      <div class="error-counter">
        ${errorCount} Error${errorCount !== 1 ? "s" : ""}
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
}

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "the-rock-is-watching-u" is now active!'
  );

  // Create the provider for the side bar view
  const provider = new TheRockViewProvider(context);

  // Register the provider
  const registrationSideBar = vscode.window.registerWebviewViewProvider(
    TheRockViewProvider.viewType,
    provider
  );
  context.subscriptions.push(registrationSideBar);

  // Setup diagnostic collection to track errors
  const diagnosticCollection =
    vscode.languages.createDiagnosticCollection("theRockWatchingU");

  // Listen for document changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      updateErrorStatus(
        event.document,
        diagnosticCollection,
        context,
        provider
      );

      // Reset typing timer when user types
      if (typingTimer) {
        clearTimeout(typingTimer);
      }

      // Set a timer to enable sound after user stops typing for 2 seconds
      typingTimer = setTimeout(() => {
        if (!userInteracted) {
          userInteracted = true;
          provider.updateContent(isInErrorMode);
        }
      }, 2000);
    }),

    // Listen for save events to enable sound
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!userInteracted) {
        userInteracted = true;
        provider.updateContent(isInErrorMode);
      }
    }),

    // Listen for active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateErrorStatus(
          editor.document,
          diagnosticCollection,
          context,
          provider
        );
      }
    }),

    diagnosticCollection
  );

  // If we already have an active editor, check it for errors
  if (vscode.window.activeTextEditor) {
    updateErrorStatus(
      vscode.window.activeTextEditor.document,
      diagnosticCollection,
      context,
      provider
    );
  }
}

// Update the error status for the current document
async function updateErrorStatus(
  document: vscode.TextDocument,
  diagnosticCollection: vscode.DiagnosticCollection,
  context: vscode.ExtensionContext,
  provider: TheRockViewProvider
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
  if (stateChanged || true) {
    isInErrorMode = shouldBeInErrorMode;
    provider.updateContent(isInErrorMode);
  }
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
