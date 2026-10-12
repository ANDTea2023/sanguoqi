const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root');

// Keep a useful page visible if loading or rendering fails.
void import('./chess').then(({ mountChessGame }) => {
  mountChessGame(app);
}).catch((error: unknown) => {
  console.error('Unable to open Three Kingdoms Xiangqi', error);
  app.replaceChildren();
  const message = document.createElement('section');
  message.style.cssText = 'max-width:480px;margin:15vh auto;padding:32px;border:1px solid #d6dece;border-radius:12px;background:#fffdf6;color:#263e32;font:16px/1.8 system-ui,sans-serif';
  const title = document.createElement('h1');
  title.textContent = '棋盘暂时没有打开';
  const detail = document.createElement('p');
  detail.textContent = '请刷新重试；若仍无法打开，请双击项目里的“启动三国象棋.cmd”，并保持启动窗口打开。';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.style.cssText = 'padding:10px 20px;border:0;border-radius:6px;background:#315e4c;color:white;font:inherit;cursor:pointer';
  retry.addEventListener('click', () => location.reload());
  message.append(title, detail, retry);
  app.append(message);
});
