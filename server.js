const express = require('express');
const { chromium } = require('playwright');
const app = express();

app.use(express.json());

app.post('/generate-snapshot', async (req, res) => {
  const { html, appId, appSecret, groupId } = req.body;

  if (!html || !appId || !appSecret || !groupId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  let browser;
  try {
    // 1. Launch Headless Chrome Browser
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    // 2. Take Screenshot of HTML Table
    const imageBuffer = await page.screenshot({ type: 'png', fullPage: true });
    await browser.close();

    // 3. Get SeaTalk Token
    const tokenRes = await fetch('https://openapi.seatalk.io/auth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret })
    });
    const tokenData = await tokenRes.json();
    const token = tokenData.access_token;

    if (!token) {
      return res.status(500).json({ error: 'Failed to get SeaTalk Token', details: tokenData });
    }

    // 4. Upload Image Blob to SeaTalk Media
    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('image', blob, 'schedule.png');

    const uploadRes = await fetch('https://openapi.seatalk.io/media/v1/upload_image', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    const imageKey = uploadData.image_key;

    if (!imageKey) {
      return res.status(500).json({ error: 'Failed to upload image to SeaTalk', details: uploadData });
    }

    // 5. Send Image to Group Chat
    const sendRes = await fetch('https://openapi.seatalk.io/messaging/v1/group_chat/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        group_id: groupId,
        msg_type: 'image',
        image: { image_key: imageKey }
      })
    });
    const sendData = await sendRes.json();

    return res.json({ success: true, result: sendData });
  } catch (error) {
    if (browser) await browser.close();
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Snapshot Server running on port ${PORT}`));
