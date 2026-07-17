const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 720,
    height: 1200,
    show: false,
    frame: false,
    webPreferences: { offscreen: true }
  });
  await window.loadFile(path.join(__dirname, 'portrait-fixture.html'));
  await new Promise((resolve) => setTimeout(resolve, 150));
  const image = await window.webContents.capturePage();
  const output = path.join(__dirname, '..', 'preview', 'portrait-test.png');
  await fs.writeFile(output, image.toPNG());
  console.log(output);
  app.quit();
});
