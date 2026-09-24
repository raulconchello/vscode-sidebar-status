const vscode = require('vscode');

// Pages that take plugin views directly.
const DIRECT_PAGES = ['explorer', 'scm', 'debug', 'remote'];

// Pages owned by other extensions; the view only shows while that extension is installed.
const EXTENSION_PAGES = ['gitlens', 'gitlensInspect', 'github-pull-requests', 'python'];

// Search and Extensions don't take plugin views. These views start in hidden pages with
// the same name and are moved over once with VS Code's own command, which remembers it.
const MOVED_PAGES = { search: 'workbench.view.search', extensions: 'workbench.view.extensions' };

async function activate(context) {
  const git = await getGitApi();
  const changed = new vscode.EventEmitter();
  const provider = { onDidChangeTreeData: changed.event, getTreeItem: (item) => item, getChildren: () => items(git) };
  const names = [...DIRECT_PAGES, ...EXTENSION_PAGES, ...Object.keys(MOVED_PAGES)];
  const views = names.map((name) => vscode.window.createTreeView(`sidebarWorkspace.${name}`, { treeDataProvider: provider }));
  context.subscriptions.push(changed, ...views);

  const update = () => {
    const title = titleFor(git);
    for (const view of views) view.title = title;
    changed.fire();
  };

  if (git) {
    const watch = (repo) => context.subscriptions.push(repo.state.onDidChange(update));
    git.repositories.forEach(watch);
    context.subscriptions.push(
      git.onDidOpenRepository((repo) => { watch(repo); update(); }),
      git.onDidCloseRepository(update),
      git.onDidChangeState(update),
    );
  }
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.workspace.onDidChangeWorkspaceFolders(update),
  );
  update();

  for (const page of EXTENSION_PAGES) {
    await vscode.commands.executeCommand('setContext', `sidebarWorkspace.page.${page}`, pageExists(page));
  }
  await setUp(context, names.filter((name) => !EXTENSION_PAGES.includes(name) || pageExists(name)));
}

async function getGitApi() {
  try {
    const ext = vscode.extensions.getExtension('vscode.git');
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return exports.getAPI(1);
  } catch {
    return undefined; // git is disabled or missing
  }
}

// The first time, moves the Search and Extensions views into place and opens every view.
// VS Code starts plugin views collapsed in Explorer, Source Control and Run and Debug, and
// can only open a view by showing its page, so this flips through the pages once.
async function setUp(context, names) {
  const firstRun = !context.globalState.get('setUp');
  const run = (...args) => vscode.commands.executeCommand(...args);
  if (firstRun) {
    for (const [name, page] of Object.entries(MOVED_PAGES)) {
      await run('vscode.moveViews', { viewIds: [`sidebarWorkspace.${name}`], destinationId: page });
    }
  }
  await run('setContext', 'sidebarWorkspace.moved', true);
  if (firstRun) {
    for (const name of names) await run(`sidebarWorkspace.${name}.focus`);
    await run('workbench.view.explorer');
    await context.globalState.update('setUp', true);
  }
}

function pageExists(id) {
  return vscode.extensions.all.some((ext) =>
    (ext.packageJSON.contributes?.viewsContainers?.activitybar ?? []).some((c) => c.id === id));
}

function workspaceName() {
  return (vscode.workspace.name ?? 'No folder').replace(/ \(Workspace\)$/, '');
}

function currentRepo(git) {
  const uri = vscode.window.activeTextEditor?.document.uri;
  return (uri && git.getRepository(uri)) || git.repositories[0];
}

// Same markers as VS Code's status bar: * changed, + staged, ! conflicts.
function branchLabel(repo) {
  const { HEAD, workingTreeChanges, untrackedChanges = [], indexChanges, mergeChanges } = repo.state;
  const name = HEAD.name ?? HEAD.commit?.slice(0, 8) ?? 'detached';
  return name
    + (workingTreeChanges.length + untrackedChanges.length > 0 ? '*' : '')
    + (indexChanges.length > 0 ? '+' : '')
    + (mergeChanges.length > 0 ? '!' : '');
}

function syncInfo(head) {
  if (!head.upstream) {
    return { arrows: '', label: 'Publish branch', icon: 'cloud-upload', command: 'git.publish' };
  }
  const { ahead = 0, behind = 0 } = head;
  if (ahead === 0 && behind === 0) {
    return { arrows: '', label: 'Up to date', icon: 'check', command: 'git.sync' };
  }
  const arrows = [behind && `↓${behind}`, ahead && `↑${ahead}`].filter(Boolean).join(' ');
  const detail = [behind && `${behind} to pull`, ahead && `${ahead} to push`].filter(Boolean).join(', ');
  return { arrows, label: `Sync (${detail})`, icon: 'sync', command: 'git.sync' };
}

// "Workspace", plus arrows when there is something to pull or push.
function titleFor(git) {
  const head = git && currentRepo(git)?.state.HEAD;
  const arrows = head ? syncInfo(head).arrows : '';
  return arrows ? `Workspace ${arrows}` : 'Workspace';
}

function items(git) {
  const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const workspace = item(workspaceName(), 'root-folder', folder?.replace(require('os').homedir(), '~'));
  const repo = git && currentRepo(git);
  if (!repo?.state.HEAD) return [workspace, item('No git repository', 'circle-slash')];

  const changes = repo.state.workingTreeChanges.length + (repo.state.untrackedChanges ?? []).length + repo.state.indexChanges.length;
  const sync = syncInfo(repo.state.HEAD);
  return [
    workspace,
    item(branchLabel(repo), 'git-branch', changes ? `${changes} changed` : '', { command: 'git.checkout', title: 'Switch branch' }),
    item(sync.label, sync.icon, '', { command: sync.command, title: sync.label }),
  ];
}

function item(label, icon, description = '', command = undefined) {
  const treeItem = new vscode.TreeItem(label);
  treeItem.iconPath = new vscode.ThemeIcon(icon);
  treeItem.description = description;
  treeItem.command = command;
  treeItem.tooltip = command ? command.title : label;
  return treeItem;
}

module.exports = { activate };
