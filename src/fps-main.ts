import './style.css';
import { mountFpsGame } from './fps';

const root = document.querySelector<HTMLDivElement>('#app');

function showStartupError(container: HTMLElement): void {
  const message = document.createElement('section');
  message.setAttribute('role', 'alert');
  message.style.cssText = 'max-width: 640px; margin: 12vh auto; padding: 32px; color: #e6eadf; background: #182022; border: 1px solid #58655a; font: 16px/1.7 sans-serif;';

  const title = document.createElement('h1');
  title.textContent = '射击游戏暂时未能启动';
  const detail = document.createElement('p');
  detail.textContent = '请保持启动窗口打开，然后点击重试。如果仍然无法进入，请关闭这个网页，再双击“启动射击游戏.cmd”。';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = '重新加载游戏';
  retry.style.cssText = 'padding: 12px 20px; border: 0; background: #c7e07a; color: #101416; cursor: pointer; font: inherit;';
  retry.addEventListener('click', () => window.location.reload());
  message.append(title, detail, retry);
  container.replaceChildren(message);
  document.body.dataset.fpsState = 'error';
}

if (root) {
  try {
    mountFpsGame(root);
    document.body.dataset.fpsState = 'ready';
  } catch (error) {
    console.error('NIGHTFALL startup failed.', error);
    showStartupError(root);
  }
} else {
  const fallback = document.createElement('div');
  document.body.append(fallback);
  showStartupError(fallback);
}
