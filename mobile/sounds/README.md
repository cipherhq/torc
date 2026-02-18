# Custom Notification Sounds

This folder should contain the audio files for different notification types.

---

## 🎵 Required Sound Files

Create these `.wav` files (or `.caf` for iOS, `.m4a` also supported):

### 1. `new-request.wav` (Provider App)
**Used for:** New job request arrives (provider needs to accept)  
**Should sound like:** Distinctive "ring" or alert tone that gets attention  
**Duration:** 2-5 seconds (can be longer, but keep under 30s)  
**Volume:** Louder/more prominent than other sounds  
**Example:** Doorbell, phone ring, urgent chime  

**Why important:** This is the most critical sound - providers need to hear it immediately when a new job comes in, even if the app is backgrounded.

### 2. `accepted.wav` (Customer App)
**Used for:** Provider accepted the customer's request  
**Should sound like:** Pleasant success chime  
**Duration:** 1-2 seconds  
**Example:** Positive "ding", success bell  

### 3. `cancelled.wav` (Both Apps)
**Used for:** Job was cancelled  
**Should sound like:** Neutral notification  
**Duration:** 1-2 seconds  
**Example:** Soft "boop", neutral tone  

### 4. `completed.wav` (Customer App)
**Used for:** Job completed, asking for rating  
**Should sound like:** Success/completion sound  
**Duration:** 1-2 seconds  
**Example:** "Task complete" chime  

### 5. `arrived.wav` (Customer App - Optional)
**Used for:** Provider arrived at location  
**Should sound like:** Informational tone  
**Duration:** 1 second  
**Example:** Quick "beep", arrival notification  

---

## 🛠️ Creating Sound Files

### Option 1: Use Free Sound Libraries
- **Freesound:** https://freesound.org/ (search "notification", "alert", "chime")
- **Zapsplat:** https://www.zapsplat.com/sound-effect-categories/ (free sounds)
- **Notification Sounds:** https://notificationsounds.com/

### Option 2: Generate with AI
- **ElevenLabs:** Generate custom sound effects
- **Suno / Soundraw:** AI music/sound generation

### Option 3: Record Custom
- Use GarageBand (Mac/iOS) or Audacity (free, cross-platform)
- Keep files small (< 200KB each)

---

## 📐 Technical Requirements

### Format
- **iOS:** `.wav`, `.caf`, `.m4a`, or `.aiff`
- **Android:** `.wav`, `.mp3`, `.ogg`
- **Safe for both:** `.wav` (16-bit, 44.1kHz)

### File Size
- Keep under 500KB per file (mobile apps bundle these)
- Most notification sounds are 50-200KB

### Length
- iOS: Max 30 seconds (longer sounds are truncated)
- Android: No hard limit, but keep under 10 seconds
- Recommended: 1-5 seconds for most notifications

---

## 🧪 Testing Sounds

### Test in your app (local notification)
```js
import { scheduleLocalNotification } from './utils/pushNotifications';

// Test new-request sound
await scheduleLocalNotification({
  title: 'Test Notification',
  body: 'Testing custom sound',
  data: {},
  sound: 'new-request.wav',
  seconds: 1,
});
```

### Test on device
1. Make sure sound file is in `assets/sounds/`
2. Reference it in `app.json` plugins → expo-notifications → sounds
3. Rebuild the app: `npx expo run:ios` or `npx expo run:android`
4. Send a push with that sound name
5. Notification should play your custom sound

### Common issues
- **Sound doesn't play:** Device on silent (iOS still plays if permission granted), or sound file not bundled
- **Wrong sound plays:** Check `app.json` lists the file, and push payload uses exact filename
- **Crackling/distortion:** Re-export sound at 16-bit 44.1kHz WAV

---

## 🔧 Usage in Push Worker

In `workers/push-notification-worker.js`, when sending a push:

```js
await sendPushToUser(customerId, {
  notificationType: 'job_accepted',
  title: 'Provider Found!',
  body: 'A provider accepted your request.',
  data: { screen: 'LiveTracking', jobId: '...' },
  sound: 'accepted.wav',  // ← Custom sound
  priority: 'high',
});
```

Expo will play `accepted.wav` on the device when the push arrives.

---

## 📋 Sound Mapping Reference

| Event              | Sound File         | Who Gets It | Priority |
|--------------------|--------------------|-------------|----------|
| New job request    | `new-request.wav`  | Provider    | MAX      |
| Job accepted       | `accepted.wav`     | Customer    | High     |
| Job cancelled      | `cancelled.wav`    | Both        | Default  |
| Job completed      | `completed.wav`    | Customer    | Default  |
| Provider arrived   | `arrived.wav`      | Customer    | High     |

---

## 🎨 Sound Design Tips

### For "new-request" (Provider Ring)
- **Goal:** Get provider's attention immediately, even from another room
- **Style:** Clear, urgent, but not annoying
- **Reference:** Uber driver "new ride request" sound, food delivery app alerts
- **Consider:** Rising pitch (low → high) to indicate urgency

### For other notifications
- **Keep it subtle** – users get many notifications per day
- **Match brand tone** – professional, friendly, not gimmicky
- **Test in context** – play sounds at different times of day, in different locations

---

## ✅ Checklist

- [ ] Create or download 5 sound files (wav format, < 200KB each)
- [ ] Put them in `assets/sounds/` directory
- [ ] Add to `app.json` → plugins → expo-notifications → sounds
- [ ] Rebuild app (`npx expo run:ios` / `npx expo run:android`)
- [ ] Test each sound with a local notification
- [ ] Update push worker to use correct sound for each event type
- [ ] Test on real device with actual job flow

**Note:** Simulators don't play notification sounds. You MUST test on a physical iOS or Android device.
