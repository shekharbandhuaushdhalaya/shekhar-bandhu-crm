const express = require('express');
const router = express.Router();
const SocialIntegration = require('../../models/SocialIntegration');
// Native global fetch will be used (Node 18+)

// Helper: check if meta configuration is present
const getMetaConfig = () => {
  return {
    appId: process.env.META_APP_ID,
    appSecret: process.env.META_APP_SECRET,
    redirectUri: process.env.META_REDIRECT_URI || 'http://localhost:5000/api/social/callback'
  };
};

// 1. GET /api/social/auth-url -> Get OAuth URL
router.get('/auth-url', (req, res) => {
  const { appId, redirectUri } = getMetaConfig();
  if (!appId) {
    return res.status(400).json({ 
      error: 'Meta Developer App configuration is missing on the server. Please add META_APP_ID and META_APP_SECRET to your .env file.' 
    });
  }

  const scope = 'pages_manage_posts,pages_read_engagement,instagram_basic,instagram_content_publish,pages_show_list';
  const fbAuthUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
  
  res.json({ url: fbAuthUrl });
});

// 2. GET /api/social/callback -> Handles callback and token exchange
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  const { appId, appSecret, redirectUri } = getMetaConfig();

  if (!code) {
    return res.status(400).send('Authorization code is missing');
  }

  try {
    // A. Exchange code for User Access Token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(tokenData.error.message || 'Failed token exchange');
    }

    const userAccessToken = tokenData.access_token;

    // B. Get User Pages (Long-Lived Page Access Tokens)
    const pagesUrl = `https://graph.facebook.com/v18.0/me/accounts?access_token=${userAccessToken}`;
    const pagesRes = await fetch(pagesUrl);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(pagesData.error.message || 'Failed to fetch pages');
    }

    const pages = pagesData.data || [];
    let savedCount = 0;

    for (const page of pages) {
      // Save/Update Page integration
      await SocialIntegration.findOneAndUpdate(
        { platform: 'facebook', accountId: page.id },
        {
          accountName: page.name,
          accessToken: page.access_token,
          followersCount: 'Connected',
          isActive: true
        },
        { upsert: true, new: true }
      );
      savedCount++;

      // C. Optional: Find Instagram Business Account linked to this Facebook Page
      const igUrl = `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`;
      const igRes = await fetch(igUrl);
      const igData = await igRes.json();

      if (igData.instagram_business_account) {
        const igAccount = igData.instagram_business_account;
        // Save Instagram integration using the same page token (which grants access to both)
        await SocialIntegration.findOneAndUpdate(
          { platform: 'instagram', accountId: igAccount.id },
          {
            accountName: `${page.name} (Instagram)`,
            accessToken: page.access_token,
            followersCount: 'Connected',
            isActive: true
          },
          { upsert: true, new: true }
        );
        savedCount++;
      }
    }

    // Success response
    res.send(`
      <html>
        <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background-color: #f0f2f5;">
          <div style="background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); text-align: center;">
            <div style="color: #4caf50; font-size: 48px; margin-bottom: 16px;">✓</div>
            <h1 style="margin: 0 0 10px 0; color: #1c1e21;">Linked Successfully!</h1>
            <p style="color: #606770; margin-bottom: 20px;">Successfully linked ${savedCount} Meta Page(s)/Handle(s) to your CRM.</p>
            <button onclick="window.close()" style="background: #1877f2; color: white; border: none; padding: 10px 20px; border-radius: 4px; font-weight: bold; cursor: pointer;">Close Window</button>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('Meta OAuth Error:', error.message);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// 3. GET /api/social/accounts -> List active integrated social profiles
router.get('/accounts', async (req, res) => {
  try {
    const integrations = await SocialIntegration.find({ isActive: true }).select('-accessToken');
    res.json(integrations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. DELETE /api/social/accounts/:id -> Disconnect an integration
router.delete('/accounts/:id', async (req, res) => {
  try {
    await SocialIntegration.findByIdAndDelete(req.params.id);
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. POST /api/social/publish -> Publish post to Facebook / Instagram
router.post('/publish', async (req, res) => {
  const { platforms, text, imageUrl } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Post copy/text is required' });
  }

  const results = [];
  const errors = [];

  try {
    for (const platform of platforms) {
      const integration = await SocialIntegration.findOne({ platform, isActive: true });

      if (!integration) {
        errors.push({ platform, error: 'Integration token is missing or not active.' });
        continue;
      }

      if (platform === 'facebook') {
        // A. Post to Facebook Page feed
        const postUrl = `https://graph.facebook.com/v18.0/${integration.accountId}/feed`;
        const payload = {
          message: text,
          access_token: integration.accessToken
        };
        if (imageUrl) {
          payload.link = imageUrl;
        }

        const fbRes = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const fbData = await fbRes.json();

        if (fbData.error) {
          errors.push({ platform, error: fbData.error.message });
        } else {
          results.push({ platform, id: fbData.id, link: `https://facebook.com/${fbData.id}` });
        }
      } else if (platform === 'instagram') {
        // B. Publish to Instagram
        if (!imageUrl) {
          errors.push({ platform, error: 'Instagram posts require an image URL' });
          continue;
        }

        // Step 1: Upload media container
        const mediaUrl = `https://graph.facebook.com/v18.0/${integration.accountId}/media`;
        const mediaRes = await fetch(mediaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image_url: imageUrl,
            caption: text,
            access_token: integration.accessToken
          })
        });
        const mediaData = await mediaRes.json();

        if (mediaData.error) {
          errors.push({ platform, error: mediaData.error.message });
          continue;
        }

        // Step 2: Publish the media container
        const publishUrl = `https://graph.facebook.com/v18.0/${integration.accountId}/media_publish`;
        const publishRes = await fetch(publishUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            creation_id: mediaData.id,
            access_token: integration.accessToken
          })
        });
        const publishData = await publishRes.json();

        if (publishData.error) {
          errors.push({ platform, error: publishData.error.message });
        } else {
          results.push({ platform, id: publishData.id });
        }
      } else {
        // Fallback for mocked integrations
        results.push({ platform, status: 'mocked_success', message: `Mocked publish success on ${platform}` });
      }
    }

    res.json({ results, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
