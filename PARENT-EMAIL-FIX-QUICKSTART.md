# Parent Email Deliverability - Quick Start

## 🚨 Critical Actions (Do These First!)

Parent invitation emails are landing in spam because of missing email authentication. Follow these steps to fix it:

## Step 1: Update Your .env File (5 minutes)

```bash
# Turn off development mode
EMAIL_DEV_MODE="false"

# Gmail SMTP Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"

# Your Gmail credentials
SMTP_USER="your-email@gmail.com"
SMTP_PASS="xxxx xxxx xxxx xxxx"  # Get this from Step 2!

# From email (should match SMTP_USER)
SMTP_FROM_EMAIL="your-email@gmail.com"
SMTP_FROM_NAME="Skoolee AI"
```

## Step 2: Get Gmail App Password (10 minutes)

**Important**: You CANNOT use your regular Gmail password for SMTP!

1. **Enable 2-Step Verification** (if not already enabled):
   - Go to: https://myaccount.google.com/security
   - Click "2-Step Verification"
   - Follow the setup wizard

2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it: "Skoolee AI SMTP"
   - Click "Generate"
   - **Copy the 16-character password** (format: `xxxx xxxx xxxx xxxx`)

3. **Update .env**:
   ```bash
   SMTP_PASS="abcd efgh ijkl mnop"  # Paste your generated password
   ```

4. **Restart your application**:
   ```bash
   npm run dev
   # or
   pm2 restart skoolee-ai
   ```

## Step 3: Configure SPF Record (15 minutes)

**What it does**: Tells email providers that Gmail is allowed to send emails on your behalf.

1. **Go to your domain DNS settings**:
   - GoDaddy: https://dcc.godaddy.com/
   - Namecheap: https://ap.www.namecheap.com/
   - Cloudflare: https://dash.cloudflare.com/

2. **Add a TXT record**:
   - **Type**: TXT
   - **Name/Host**: `@` (or leave blank for root domain)
   - **Value**: `v=spf1 include:_spf.google.com ~all`
   - **TTL**: 3600 (or "Automatic")

3. **Save** and wait 1-2 hours for propagation

4. **Verify it worked**:
   ```bash
   # Run in terminal (replace yourdomain.com)
   nslookup -type=txt yourdomain.com
   ```
   You should see: `v=spf1 include:_spf.google.com ~all`

## Step 4: Test Email Deliverability (5 minutes)

1. **Go to**: https://www.mail-tester.com
2. **Copy the test email address** shown on the page
3. **Send a parent invitation** to that address
4. **Click** "Then check your score"
5. **Target Score**: 8/10 or higher

**If score is below 8**:
- Check that SPF record is configured (Step 3)
- Verify App Password is correct (Step 2)
- Ensure `EMAIL_DEV_MODE="false"` (Step 1)

## What Was Fixed in Code ✅

The following improvements have already been made to the codebase:

### 1. Enhanced Email Headers
- Added anti-spam headers (X-Priority, Importance, Precedence)
- Improved Message-ID with proper domain
- Added List-Unsubscribe for professional senders

### 2. Parent-Specific Email Content
- **From Name**: Shows school name (e.g., "ABC School") for better recognition
- **Subject**: "Parent Portal Access for [School]" instead of generic invitation
- **Content**: Explains what the parent portal offers (attendance, grades, fees)
- **Professional Footer**: Includes school context

### 3. Better Email Template
- Clear value proposition for parents
- Security reminders
- Multi-child support messaging
- Professional, non-spammy design

## Expected Results

| Timeline | Actions Completed | Expected Inbox Rate |
|----------|-------------------|---------------------|
| **Now** | Code changes only | 20-30% |
| **After Step 1-2** | SMTP configured | 40-50% |
| **After Step 3** | SPF configured | 70-80% |
| **After 1 week** | DKIM/DMARC added | 85-90% |
| **After 1 month** | Custom domain | 95%+ |

## Next Steps (Optional but Recommended)

For 90%+ inbox placement, also configure:

1. **DKIM** (DomainKeys Identified Mail)
   - Adds digital signature to emails
   - Setup guide: [docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md](./docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md#step-2-configure-dkim-domainkeys-identified-mail)

2. **DMARC** (Domain-based Message Authentication)
   - Tells providers what to do with failed authentication
   - Setup guide: [docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md](./docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md#step-3-configure-dmarc-domain-based-message-authentication)

3. **Custom Domain Email** (Best Practice)
   - Use `noreply@yourschool.com` instead of Gmail
   - Looks more professional
   - Better deliverability
   - Setup guide: [docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md](./docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md#recommended-use-custom-domain-email)

## Troubleshooting

### "Emails still going to spam after following steps"

1. **Wait 24-48 hours** after DNS changes (SPF takes time to propagate)
2. **Check mail-tester.com score** - should be 8/10+
3. **Verify SPF record** with `nslookup -type=txt yourdomain.com`
4. **Check email headers** in Gmail (Show original → look for `spf=pass`)

### "Cannot generate App Password"

- **Cause**: 2-Step Verification is not enabled
- **Solution**: Enable 2FA first at https://myaccount.google.com/security

### "SMTP connection failed"

- **Check**: `SMTP_USER` matches your Gmail address exactly
- **Check**: `SMTP_PASS` is the 16-character App Password (not regular password)
- **Check**: Copied password correctly (no extra spaces)

### "Mail-tester score is below 5"

- **Likely cause**: SPF record not configured or not propagated yet
- **Solution**: Wait 2-4 hours after adding DNS record, then test again

## Parent Instructions

If some parents still report spam, share these instructions:

**For Gmail**:
1. Check Spam folder
2. Click the email
3. Click "Not spam" button at top
4. Add sender to contacts

**For Outlook/Hotmail**:
1. Check Junk folder  
2. Right-click email
3. Select "Mark as not junk"
4. Add sender to contacts

## Full Documentation

For complete setup instructions, DNS configuration, and advanced troubleshooting:

📖 **[Parent Email Deliverability Guide](./docs/PARENT-EMAIL-DELIVERABILITY-GUIDE.md)**

## Support

- **Mail-Tester**: https://www.mail-tester.com
- **Gmail App Passwords**: https://myaccount.google.com/apppasswords
- **Google Workspace Email Auth**: https://support.google.com/a/answer/33786

---

**Last Updated**: September 9, 2026  
**Estimated Time**: 30-40 minutes for Steps 1-4  
**Priority**: 🔴 Critical - Do Steps 1-4 immediately
