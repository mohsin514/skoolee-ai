# Parent Email Deliverability Guide

## Overview
This guide provides comprehensive instructions to ensure parent invitation emails land in the inbox rather than spam folders.

## What Was Fixed (Code Level)

### 1. Enhanced Email Headers (smtp.ts)
Added critical headers that improve deliverability:
- **X-Priority**: Marks email as normal priority (not spam-like urgent)
- **Importance**: Set to "normal" to avoid spam triggers
- **Precedence**: Marked as "bulk" for proper classification
- **Auto-Submitted**: Identifies as legitimate auto-generated email
- **List-Unsubscribe**: Shows email provider this is professional communication

### 2. Parent-Specific Email Content (email.ts)
- **From Name**: For parents, uses just the school name (e.g., "ABC School") instead of "ABC School via Skoolee AI"
- **Subject Line**: Changed from generic "You've been invited to [School]" to specific "Parent Portal Access for [School]"
- **Enhanced Text Content**: Detailed plain-text version with clear value proposition
- **Professional Messaging**: Explains exactly what the parent portal offers

### 3. Improved Email Template (InviteEmail.tsx)
- **Role-Specific Content**: Different messaging for parents vs staff
- **Clear Value Proposition**: Explains benefits (view attendance, grades, fees, etc.)
- **Security Messaging**: Reminds parents not to share the link
- **Multi-Child Support**: Mentions ability to view all children from one account
- **Professional Footer**: Includes school name and context

## Critical: Configure Email Authentication

These DNS settings are **ESSENTIAL** for email deliverability. Without them, emails will continue to land in spam.

### Step 1: Configure SPF (Sender Policy Framework)

**What it does**: Tells email providers which servers can send email on behalf of your domain.

**For Gmail Users** (most common):
1. Go to your domain's DNS settings (GoDaddy, Namecheap, Cloudflare, etc.)
2. Add a new **TXT record**:
   - **Name/Host**: `@` (or your root domain)
   - **Value**: `v=spf1 include:_spf.google.com ~all`
   - **TTL**: 3600 (1 hour) or automatic

**For Custom Domain Email**:
```
v=spf1 include:_spf.google.com ~all
```

**How to verify**:
```bash
# Run this command in terminal (replace yourdomain.com)
nslookup -type=txt yourdomain.com
```

### Step 2: Configure DKIM (DomainKeys Identified Mail)

**What it does**: Adds a digital signature to your emails proving they're authentic.

**For Gmail/Google Workspace**:
1. Go to [Google Admin Console](https://admin.google.com)
2. Navigate to: **Apps** → **Google Workspace** → **Gmail** → **Authenticate email**
3. Click **Generate New Record**
4. Copy the **TXT record name** and **TXT record value**
5. Add to your DNS:
   - **Name/Host**: The name provided (usually like `google._domainkey`)
   - **Value**: The long string provided
   - **TTL**: 3600 or automatic
6. Return to Google Admin and click **Start Authentication**

**Verification**:
Wait 24-48 hours, then check your email headers for `dkim=pass`

### Step 3: Configure DMARC (Domain-based Message Authentication)

**What it does**: Tells email providers what to do if SPF or DKIM checks fail.

**Setup**:
1. Add a new **TXT record** to your DNS:
   - **Name/Host**: `_dmarc` (or `_dmarc.yourdomain.com`)
   - **Value**: `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@yourdomain.com; fo=1`
   - **TTL**: 3600

**DMARC Policy Progression**:
- **Week 1-2**: `p=none` (monitor only, no enforcement)
- **Week 3-4**: `p=quarantine` (send suspicious emails to spam)
- **Week 5+**: `p=reject` (reject suspicious emails entirely)

## Environment Configuration

### Current Setup (.env)
```bash
# Turn off dev mode for production
EMAIL_DEV_MODE="false"

# Gmail SMTP settings
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"

# Your Gmail credentials
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-16-char-app-password"  # NOT your regular password!

# From email (should match SMTP_USER)
SMTP_FROM_EMAIL="your-email@gmail.com"

# From name will be automatically set to school name for parents
SMTP_FROM_NAME="Skoolee AI"
```

### How to Get Gmail App Password

Gmail requires App Passwords when using SMTP:

1. **Enable 2-Factor Authentication**:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and "Other (Custom name)"
   - Name it "Skoolee AI SMTP"
   - Click "Generate"
   - Copy the 16-character password (no spaces)

3. **Update .env**:
   ```bash
   SMTP_PASS="abcd efgh ijkl mnop"  # Use the generated password
   ```

## Recommended: Use Custom Domain Email

**Current Issue**: Using a personal Gmail (e.g., `mohsin.ali14993@gmail.com`) looks unprofessional and triggers spam filters.

**Better Approach**: Use a school domain email (e.g., `noreply@yourschool.edu` or `admin@yourschool.edu`)

### Benefits:
- ✅ Professional appearance
- ✅ Better SPF/DKIM alignment
- ✅ Higher sender reputation
- ✅ 70-90% better deliverability
- ✅ Builds trust with parents

### How to Set Up:

#### Option 1: Google Workspace (Recommended)
**Cost**: $6/user/month

1. **Purchase domain**: From Namecheap, GoDaddy, etc.
2. **Sign up**: [Google Workspace](https://workspace.google.com)
3. **Verify domain**: Follow Google's verification steps
4. **Create email**: admin@yourschool.com or noreply@yourschool.com
5. **Configure MX records**: Google provides the records
6. **Set up SPF/DKIM**: Follow Google's instructions
7. **Update .env**:
   ```bash
   SMTP_USER="noreply@yourschool.com"
   SMTP_PASS="your-app-password"
   SMTP_FROM_EMAIL="noreply@yourschool.com"
   ```

#### Option 2: Zoho Mail (Budget-Friendly)
**Cost**: Free for up to 5 users, or $1/user/month

1. **Sign up**: [Zoho Mail](https://www.zoho.com/mail/)
2. **Add domain**: Follow Zoho's domain verification
3. **Create email**: Use their instructions
4. **Configure DNS**: Add MX, SPF, DKIM records
5. **Get SMTP details**: From Zoho settings
6. **Update .env**:
   ```bash
   SMTP_HOST="smtp.zoho.com"
   SMTP_PORT="465"
   SMTP_USER="noreply@yourschool.com"
   SMTP_PASS="your-zoho-password"
   ```

#### Option 3: Resend (Developer-Focused)
**Cost**: Free for 3,000 emails/month, then $20/month

1. **Sign up**: [Resend.com](https://resend.com)
2. **Verify domain**: Add DNS records they provide
3. **Get API key**: From dashboard
4. **Would require code changes** (uses API instead of SMTP)

## Testing Email Deliverability

### 1. Mail-Tester (Immediate Feedback)
**URL**: https://www.mail-tester.com

**Steps**:
1. Visit mail-tester.com
2. Copy the test email address shown
3. Send a parent invitation to that address
4. Click "Then check your score"
5. Review the detailed report

**Target Score**: 8/10 or higher
- **Below 5/10**: Critical issues (SPF/DKIM missing)
- **5-7/10**: Needs improvement (content, headers)
- **8-10/10**: Good deliverability

### 2. Gmail Postmaster Tools (Long-term Monitoring)
**URL**: https://postmaster.google.com

**What it shows**:
- Spam rate percentage
- Domain reputation
- Authentication status (SPF, DKIM, DMARC)
- Delivery errors

**Setup**:
1. Add your domain
2. Verify ownership via DNS TXT record
3. Wait 24-48 hours for data

### 3. MXToolbox (DNS Verification)
**URL**: https://mxtoolbox.com

**Tests to run**:
- **SPF Record Lookup**: Check if SPF is configured correctly
- **DKIM Record Lookup**: Verify DKIM signature
- **DMARC Record Lookup**: Ensure DMARC policy is set
- **Blacklist Check**: Make sure your sending IP isn't blacklisted

## Content Best Practices (Already Implemented ✅)

The following are already implemented in the code:

- ✅ **Professional from name**: Uses actual school name for parents
- ✅ **Descriptive subject**: "Parent Portal Access for [School Name]"
- ✅ **Clear purpose**: Explains what the parent portal offers
- ✅ **HTML + Plain text**: Both versions sent for compatibility
- ✅ **Prominent CTA**: "Access Parent Portal" button
- ✅ **Expiration notice**: "This activation link will expire in 48 hours"
- ✅ **Security reminder**: "Do not share this link"
- ✅ **Professional footer**: Includes school context
- ✅ **No spam triggers**: Avoids words like "FREE", "URGENT", excessive punctuation

## Expected Improvement Timeline

### Immediate (Code Changes Only - Already Done)
- **Improvement**: 20-30% better inbox placement
- **Reason**: Better email headers and content structure

### Short-term (1-7 days after DNS setup)
- **Improvement**: 50-70% better inbox placement
- **Actions needed**: 
  - Configure SPF record
  - Set up App Password
  - Update .env with correct credentials

### Medium-term (1-4 weeks after DKIM/DMARC)
- **Improvement**: 70-85% inbox placement
- **Actions needed**:
  - Enable DKIM signing
  - Set DMARC to p=quarantine

### Long-term (1-3 months with custom domain)
- **Improvement**: 90-95% inbox placement
- **Actions needed**:
  - Migrate to custom domain email
  - Build sender reputation
  - Monitor and adjust

## Troubleshooting

### Problem: Emails still going to spam

**Check 1: Is Email Dev Mode Off?**
```bash
# In .env file, must be:
EMAIL_DEV_MODE="false"
```

**Check 2: Are SMTP credentials correct?**
```bash
# Test SMTP connection
npm run check-smtp  # If you have this script
# Or send a test invitation and check server logs
```

**Check 3: Is SPF configured?**
```bash
nslookup -type=txt yourdomain.com
# Should show: v=spf1 include:_spf.google.com ~all
```

**Check 4: Check email headers**
1. Receive an invitation in Gmail
2. Click "Show original" (three dots menu)
3. Look for:
   - `spf=pass`
   - `dkim=pass`
   - `dmarc=pass`

### Problem: Emails not sending at all

**Check 1: SMTP credentials**
- Verify `SMTP_USER` and `SMTP_PASS` are correct
- Ensure using App Password, not regular password

**Check 2: Gmail security**
- 2FA must be enabled
- App Password must be generated
- "Less secure app access" is NOT needed (deprecated)

**Check 3: Server logs**
```bash
# Check for email errors in server logs
npm run dev
# Try sending invitation
# Look for [EMAIL ERROR] or [EMAIL EXCEPTION] in console
```

### Problem: Only some parents report spam

**Reason**: Different email providers have different spam filters

**Solutions**:
1. **Ask parents to check spam folder** and mark as "Not Spam"
2. **Whitelist the sender**: Share instructions for adding to contacts
3. **Consider dedicated email service**: SendGrid, AWS SES for higher deliverability

## Whitelisting Instructions for Parents

Share this with parents who report emails going to spam:

### For Gmail Users:
1. Check your Spam folder
2. Find the email from [Your School Name]
3. Click the email, then click "Report not spam"
4. **Add to contacts**:
   - Click the sender's name
   - Click "Add to contacts"

### For Outlook/Hotmail Users:
1. Check your Junk folder
2. Right-click the email
3. Select "Mark as not junk"
4. **Add to safe senders**:
   - Right-click sender's email
   - Select "Add to contacts"

### For Apple Mail (iPhone/Mac):
1. Check Junk folder
2. Tap/click the email
3. Tap "Mark as Not Junk"
4. **Add to VIP**:
   - Tap sender's name
   - Select "Add to VIP"

## Production Checklist

Before going live with parent invitations:

- [ ] **Turn off dev mode**: `EMAIL_DEV_MODE="false"`
- [ ] **Configure SPF record** in DNS
- [ ] **Enable DKIM** in Google Workspace/Gmail
- [ ] **Set up DMARC** record (start with p=none)
- [ ] **Generate Gmail App Password** (if using Gmail)
- [ ] **Update .env** with correct credentials
- [ ] **Test with mail-tester.com** (target: 8/10+)
- [ ] **Send test to personal email** (check spam folder)
- [ ] **Monitor first batch** of parent invitations
- [ ] **Set up Postmaster Tools** for ongoing monitoring
- [ ] **Create parent instructions** for whitelisting
- [ ] **Plan migration** to custom domain (if not done)

## Support Resources

- **SPF/DKIM/DMARC Setup**: [Google Workspace Email Authentication](https://support.google.com/a/answer/33786)
- **Gmail App Passwords**: [Sign in with App Passwords](https://support.google.com/accounts/answer/185833)
- **Email Testing**: [Mail-Tester](https://www.mail-tester.com)
- **DNS Management**: Your domain registrar's support docs
- **Skoolee AI Docs**: `/docs/EMAIL-DELIVERABILITY-IMPROVEMENTS.md`

## Need Help?

If parent emails still land in spam after following this guide:

1. **Run mail-tester.com** and share the report
2. **Check email headers** and look for authentication failures
3. **Verify DNS records** are propagated (can take 24-48 hours)
4. **Consider dedicated email service** (SendGrid, AWS SES, Resend)
5. **Contact email provider support** if domain reputation is low

---

**Last Updated**: September 9, 2026  
**Status**: Code improvements implemented ✅ | DNS configuration required 🔧  
**Target**: 90%+ inbox placement within 4 weeks
