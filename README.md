# Side Bar Status

Adds a small "Workspace" section to every side bar page, so the status bar can stay
hidden. It has three lines:

- the workspace name and folder
- the git branch (`*` changed, `+` staged, `!` conflicts); click to switch branch
- push/pull state; click to sync or publish

The section title shows arrows when there is something to pull or push: `Workspace ↓2 ↑1`.

Explorer, Source Control, Run and Debug, Remote Explorer, GitLens, GitHub and Python get
the section directly. Search and Extensions don't accept plugin sections, so it is moved
there once with VS Code's own move command. VS Code starts plugin sections collapsed in
some pages, so on first run the plugin opens each page once to expand the section.

VS Code doesn't let plugin sections be shorter than 120 points (about 5 lines).

## Build and install

    git clone https://github.com/raulconchello/vscode-sidebar-status.git
    cd vscode-sidebar-status
    npx @vscode/vsce package --skip-license
    code --install-extension sidebar-status-0.0.3.vsix

Then reload the VS Code window.
