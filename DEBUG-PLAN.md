# Eva Agent Slack Integration Debug Plan

## Current Issue
- Control UI at https://moltbot-sandbox.w-6b6.workers.dev/ stuck in infinite loading spinner
- Wrangler logs show: "Durable Object reset because its code was updated" and "Network connection lost"
- This happened after deploying updated `start-moltbot.sh` with Slack DM policy change

## Root Cause Analysis
The deployment created a new container image (`71e5917d`) which reset the Durable Object state. The container is running (38 processes) but the gateway connection is unstable.

## Fix Plan

### Step 1: Force Container Restart
The container may be in a bad state. Need to trigger a full restart:

```bash
# Option A: Redeploy (safest - triggers fresh container)
npm run deploy

# Option B: If that fails, bust the cache in Dockerfile and redeploy
# Edit Dockerfile comment and redeploy
```

### Step 2: Verify Gateway Health
After restart, check:
1. Control UI loads at `/?token=...`
2. Admin UI accessible at `/_admin/`
3. Gateway shows "Health OK" status

### Step 3: Verify Slack Configuration
Check that Slack tokens are properly set:
```bash
npx wrangler secret list
# Should show: SLACK_BOT_TOKEN, SLACK_APP_TOKEN
```

### Step 4: Test Slack Integration
1. Send a DM to Eva Agent in Slack
2. Should NOT require pairing code (DM policy = "open")
3. Eva should respond to messages

## Slack App Requirements Checklist
- [ ] Bot Token (xoxb-...) set as SLACK_BOT_TOKEN
- [ ] App Token (xapp-...) set as SLACK_APP_TOKEN
- [ ] Socket Mode enabled in Slack API dashboard
- [ ] Event Subscriptions enabled with `message.im` event
- [ ] App Home > "Allow users to send Slash commands and messages from the messages tab" enabled
- [ ] Bot has been installed/reinstalled after permission changes

## If Issues Persist
1. Check wrangler logs: `npx wrangler tail --format=pretty`
2. Check gateway logs via admin UI
3. May need to clear R2 data and start fresh (last resort)
