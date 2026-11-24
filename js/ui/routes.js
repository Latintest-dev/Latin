// The screens of the app and the tabs along the bottom, declared once.
// A new screen is one row here and one render function; main.js and the tab bar read this table.
import { renderHome } from './home.js';
import { renderPath } from './path.js';
import { renderWords } from './words.js';
import { renderProgress } from './progress.js';
import { renderSettings } from './settings.js';

export const ROUTES = [
  { path: '', tab: 'Today', render: renderHome },
  { path: 'path', tab: 'Path', render: renderPath },
  { path: 'words', tab: 'Words', render: renderWords },
  { path: 'progress', tab: 'Progress', render: renderProgress },
  { path: 'settings', tab: 'Settings', render: renderSettings },
];
