<p align="center">
  <img src="public/icons/icon-192x192.png" alt="MoeMail Logo" width="100" height="100">
  <h1 align="center">MoeMail</h1>
</p>

<p align="center">
  A cute temporary email service built with NextJS + Cloudflare 🎉
</p>

<p align="center">
  <a href="./README.en.md">English</a> |
  <a href="./README.md">简体中文</a>
</p>

<p align="center">
  <a href="https://moemail.app">Live Demo</a> •
  <a href="https://docs.moemail.app">Documentation</a> •
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#feature-guide">Feature Guide</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#mcp-built-in-cloud-service">MCP</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Live Demo

[https://moemail.app](https://moemail.app)

Full documentation is available at [https://docs.moemail.app](https://docs.moemail.app), including usage guides, API documentation, and deployment tutorials.

![Home](https://pic.otaku.ren/20241209/AQADwsUxG9k1uVZ-.jpg "Home")

![Mailbox](https://pic.otaku.ren/20241209/AQADw8UxG9k1uVZ-.jpg "Mailbox")

![Profile](https://pic.otaku.ren/20241227/AQADVsIxG7OzcFd-.jpg "Profile")

## Features

- 🔒 **Privacy Protection**: Protect your real email address from spam and unnecessary subscriptions
- ⚡ **Real-time Receipt**: Automatic polling, receive email notifications instantly
- ⏱️ **Flexible Validity**: Supports 1 hour, 24 hours, 3 days, or permanent validity
- 🎨 **Theme Switching**: Supports light and dark modes
- 📱 **Responsive Design**: Perfectly adapted for desktop and mobile devices
- 🔄 **Auto Cleanup**: Automatically cleans up expired mailboxes and emails
- 📲 **PWA Support**: Support PWA installation
- 💸 **Free Self-hosting**: Built on Cloudflare, capable of free self-hosting without any cost
- 🎉 **Cute UI**: Simple and cute UI interface
- 📤 **Sending Function**: Support sending emails using temporary addresses, based on Resend service
- 🔔 **Webhook Notification**: Support receiving new email notifications via webhook
- 🛡️ **Permission System**: Role-based access control system
- 🔑 **OpenAPI**: Support accessing OpenAPI via API Key
- 🔗 **Email Sharing**: Generate share links for an email or a single message; accessible without login
- 👤 **Account System**: OAuth and username/password login, plus registration, recovery email, and password reset
- 📬 **Notification Center**: Built-in system inbox for role changes, quota adjustments, domain changes, and other in-app notifications
- 📣 **Site-wide Broadcast**: The Emperor can publish announcements by role or to the whole site
- 🌍 **Multi-language Support**: Simplified Chinese, Traditional Chinese, English, Japanese, and Korean

## Tech Stack

| Category | Technology |
| --- | --- |
| Framework | [Next.js](https://nextjs.org/) (App Router) |
| Platform | [Cloudflare Pages](https://pages.cloudflare.com/) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Authentication | [NextAuth](https://authjs.dev/getting-started/installation?framework=Next.js) with GitHub / Google OAuth and username/password login |
| Human Verification | [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) (optional) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) |
| UI Components | Custom components based on [Radix UI](https://www.radix-ui.com/) |
| Email Handling | [Cloudflare Email Workers](https://developers.cloudflare.com/email-routing/) + [Resend](https://resend.com/) |
| Type Safety | [TypeScript](https://www.typescriptlang.org/) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Internationalization | [next-intl](https://next-intl-docs.vercel.app/), with 5 built-in languages |

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- Wrangler CLI
- Cloudflare account
- Bun (optional, only required for `pnpm webhook-test-server`)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/beilunyang/moemail.git
cd moemail
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up Wrangler:

```bash
cp wrangler.example.json wrangler.json
cp wrangler.email.example.json wrangler.email.json
cp wrangler.cleanup.example.json wrangler.cleanup.json
```

Set the Cloudflare D1 database name and database ID.

4. Set up environment variables:

```bash
cp .env.example .env.local
```

Set `AUTH_SECRET`; for OAuth login, also configure `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` or `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`. Username/password registration and login remain available without OAuth.

5. Create the local database schema:

```bash
pnpm db:migrate-local
```

### Development

1. Start the development server:

```bash
pnpm dev
```

2. Test the Email Worker:

It cannot be run or tested locally yet. Please deploy the Email Worker with Wrangler and test it there.

```bash
pnpm deploy:email
```

3. Test the Cleanup Worker:

```bash
pnpm dev:cleanup
pnpm test:cleanup
```

4. Generate mock data (mailboxes and messages):

```bash
pnpm generate-test-data
```

## Deployment

### Video Tutorial

- English (YouTube): [https://www.youtube.com/watch?v=Vcw3nqsq2-E](https://www.youtube.com/watch?v=Vcw3nqsq2-E)

### One-click Deployment

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/beilunyang/moemail)

### Local Wrangler Deployment

1. Create a `.env` file:

```bash
cp .env.example .env
```

2. Set [environment variables](#environment-variables) in the `.env` file.

3. Run the deployment script:

```bash
pnpm dlx tsx ./scripts/deploy/index.ts
```

### GitHub Actions Deployment

This project supports automated deployment with GitHub Actions. The following triggers are supported:

1. **Auto Trigger**: Automatically triggers the deployment flow when pushing to the `main` branch or pushing a new tag
2. **Manual Trigger**: Manually trigger from the GitHub Actions page

#### Deployment Steps

1. Add the following Secrets in the GitHub repository settings:

| Secret | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `AUTH_GITHUB_ID` | GitHub OAuth App ID (optional) |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Secret (optional) |
| `AUTH_GOOGLE_ID` | Google OAuth App ID (optional) |
| `AUTH_GOOGLE_SECRET` | Google OAuth App Secret (optional) |
| `AUTH_SECRET` | NextAuth Secret used to encrypt sessions; use a random string |
| `DATABASE_ID` | D1 database ID (optional; created or looked up by name if empty) |
| `KV_NAMESPACE_ID` | Cloudflare KV namespace ID (optional; created or looked up by name if empty) |
| `CUSTOM_DOMAIN` | Custom domain for the website (optional; Cloudflare Pages default domain is used if empty) |
| `PROJECT_NAME` | Pages project name (optional; defaults to `moemail`) |
| `DATABASE_NAME` | D1 database name (optional; defaults to `moemail-db`) |
| `KV_NAMESPACE_NAME` | Cloudflare KV namespace name for site settings (optional; defaults to `moemail-kv`) |

2. Choose a trigger method:

**Method 1: Push a tag**

```bash
# Create a new tag
git tag v1.0.0

# Push the tag to the remote repository
git push origin v1.0.0
```

**Method 2: Manual trigger**

- Go to the Actions page of the repository
- Select the "Deploy" workflow
- Click "Run workflow"

3. Deployment progress can be viewed in the Actions tab of the repository.

#### Notes

- Ensure all Secrets are set correctly
- When using the tag trigger, the tag must start with `v` (for example, `v1.0.0`)

## Configuration

### Email Domain Configuration

In the MoeMail User Profile page you can configure the site's email domains. Multiple domains are supported, separated by commas.

![Email Domain Configuration](https://pic.otaku.ren/20241227/AQAD88AxG67zeVd-.jpg "Email Domain Configuration")

#### Cloudflare Email Routing Configuration

To make email domains effective, you also need to configure email routing in the Cloudflare console to forward received emails to the Email Worker.

1. Log in to the [Cloudflare Console](https://dash.cloudflare.com/)
2. Select your domain
3. Click "Email" → "Email Routing" in the left menu
4. If it shows "Email Routing is currently disabled", click "Enable Email Routing"

![Enable Email Routing](https://pic.otaku.ren/20241223/AQADNcQxG_K0SVd-.jpg "Enable Email Routing")

5. After clicking, you will be prompted to add Email Routing DNS records. Click "Add records and enable"

![Add DNS Records](https://pic.otaku.ren/20241223/AQADN8QxG_K0SVd-.jpg "Add DNS Records")

6. Configure routing rules:
   - Catch-all address: enable "Catch-all"
   - Edit the Catch-all address:
     - Action: select "Send to Worker"
     - Destination: select the `email-receiver-worker` you just deployed
     - Save

![Configure Routing Rules](https://pic.otaku.ren/20241223/AQADNsQxG_K0SVd-.jpg "Configure Routing Rules")

#### Notes

- Ensure the domain's DNS is hosted on Cloudflare
- The Email Worker must be deployed successfully
- If Catch-All status is unavailable (stuck loading), click `Destination addresses` next to `Routing rules` and bind an email address there

### Environment Variables

#### Authentication

| Variable | Description |
| --- | --- |
| `AUTH_GITHUB_ID` | GitHub OAuth App ID |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App Secret |
| `AUTH_GOOGLE_ID` | Google OAuth App ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth App Secret |
| `AUTH_SECRET` | NextAuth Secret used to encrypt sessions; use a random string |

#### Cloudflare

| Variable | Description |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API Token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Account ID |
| `DATABASE_NAME` | D1 database name |
| `DATABASE_ID` | D1 database ID (optional; fetched automatically via the Cloudflare API if empty) |
| `KV_NAMESPACE_NAME` | Cloudflare KV namespace name for site settings |
| `KV_NAMESPACE_ID` | Cloudflare KV namespace ID for site settings (optional; fetched automatically via the Cloudflare API if empty) |
| `CUSTOM_DOMAIN` | Custom domain, e.g. `moemail.app` (optional; Cloudflare Pages default domain is used if empty) |
| `PROJECT_NAME` | Pages project name (optional; defaults to `moemail`) |
| `NEXT_PUBLIC_BASE_URL` | Public site URL used for metadata and other absolute links (optional; defaults to `https://moemail.app`) |

### GitHub OAuth App Configuration

1. Log in to [GitHub Developer](https://github.com/settings/developers) and create a new OAuth App
2. Generate a new `Client ID` and `Client Secret`
3. Configure:
   - `Application name`: `<your-app-name>`
   - `Homepage URL`: `https://<your-domain>`
   - `Authorization callback URL`: `https://<your-domain>/api/auth/callback/github`

### Google OAuth App Configuration

1. Visit the [Google Cloud Console](https://console.cloud.google.com/) and create a project
2. Configure the OAuth consent screen
3. Create an OAuth Client ID
   - Type: Web application
   - Authorized JavaScript origins: `https://<your-domain>`
   - Authorized redirect URIs: `https://<your-domain>/api/auth/callback/google`
4. Get the `Client ID` and `Client Secret`
5. Configure the `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` environment variables

### Turnstile Human Verification (Optional)

Login and registration support Cloudflare Turnstile human verification, disabled by default.

1. Create a site at [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile) and get the `Site Key` and `Secret Key`
2. As the Emperor, open the site settings in the User Profile, enable Turnstile, and fill in both keys
3. Once enabled, username/password login and registration require passing the human verification first

## Feature Guide

### Account & Login

Two login methods are supported:

- **OAuth**: After configuring `AUTH_GITHUB_*` or `AUTH_GOOGLE_*`, the login page shows the corresponding third-party login entry
- **Username / Password**: Works without OAuth configuration, supporting registration, login, and password changes

During registration you can bind a **recovery email** to receive a reset link when you forget your password. Reset links are valid for 30 minutes, and the same account can only receive one email within 60 seconds. Accounts without a recovery email must ask the Emperor to reset the password; the Emperor can reset the password of non-Emperor users and view the emails owned by a username.

### Permission System

The project uses a Role-Based Access Control (RBAC) system.

#### Role Configuration

New user default roles are configured by the Emperor in the site settings in the User Profile:

- **Duke**: New users get temporary email, Webhook configuration, and API Key management permissions
- **Knight**: New users get temporary email and Webhook configuration permissions
- **Civilian**: New users have no permissions and must wait for the Emperor to promote them to Knight or Duke

#### Role Levels

The system includes four role levels:

1. **Emperor**
   - Website owner
   - Has all permissions
   - Only one Emperor per site

2. **Duke**
   - Super user
   - Can use temporary email features
   - Can configure Webhook
   - Can create API Keys to call OpenAPI
   - Can be demoted to Knight or Civilian by the Emperor

3. **Knight**
   - Advanced user
   - Can use temporary email features
   - Can configure Webhook
   - Can be demoted to Civilian or promoted to Duke by the Emperor

4. **Civilian**
   - Regular user
   - No permissions
   - Can be promoted to Knight or Duke by the Emperor

#### Role Upgrade

1. **Become Emperor**
   - The first user to visit the `/api/roles/init-emperor` endpoint becomes the Emperor (website owner)
   - Once an Emperor exists, no other user can be promoted to Emperor

2. **Role Changes**
   - The Emperor can set other users as Duke, Knight, or Civilian in the User Profile page

#### Permission Details

- **Email Management**: Create and manage temporary emails
- **Webhook Management**: Configure Webhooks for email notifications
- **API Key Management**: Create and manage API access keys
- **User Management**: Promote/demote user roles, view emails owned by a user, reset passwords of non-Emperor users, and delete non-Emperor users
- **System Settings**: Manage global system settings

### System Settings

System settings are stored in Cloudflare KV, including:

| Setting | Description |
| --- | --- |
| `DEFAULT_ROLE` | Default role for new users; values: `CIVILIAN`, `KNIGHT`, `DUKE` |
| `EMAIL_DOMAINS` | Supported email domains, comma-separated |
| `ADMIN_CONTACT` | Administrator contact information |
| `MAX_EMAILS` | Maximum number of emails per user (default 30) |
| `TURNSTILE_ENABLED` / `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Turnstile human verification switch and keys |
| `EMAIL_SERVICE_ENABLED` | Whether the Resend sending service is enabled |
| `RESEND_API_KEYS` | Mapping from domains to Resend API Keys (JSON) |
| `EMAIL_ROLE_LIMITS` | Custom daily sending limits for Dukes and Knights (JSON) |
| Notification template keys | Templates for welcome, role change, password reset, quota change, and domain change in-app notifications, plus the sender address and template for password reset emails |

The **Emperor** role can configure these in the User Profile page without editing KV manually.

### Sending Emails

MoeMail supports sending emails using temporary addresses, based on the [Resend](https://resend.com/) service.

#### Features

- 📨 **Send from Temp Email**: Use created temporary emails as the sender
- 🎯 **Role Limits**: Different roles have different daily sending limits
- 💌 **HTML Support**: Supports rich text email format

#### Role Sending Limits

| Role | Daily Limit | Description |
| --- | --- | --- |
| Emperor | Unlimited | Admin has no limits |
| Duke | 5/day | Default 5 emails per day |
| Knight | 2/day | Default 2 emails per day |
| Civilian | Forbidden | No sending permission |

> 💡 **Tip**: The Emperor can customize the daily limits for Dukes and Knights in the Mail Service Configuration.

#### Configure Sending Service

1. **Get a Resend API Key**
   - Register at [Resend](https://resend.com/)
   - Create an API Key for the domain that will send emails in the console
   - Copy the API Key for later use

2. **Configure the Service**
   - Log in as Emperor
   - Go to the User Profile
   - In "Resend Service Configuration":
     - Enable the Sending Service switch
     - Enter the corresponding Resend API Key for each email domain (mapped by domain)
     - Set daily limits for Duke and Knight (optional)
   - In the notification center settings, configure the sender address and template for password reset emails
   - Save the configuration

3. **Verify the Configuration**
   - After saving, authorized users will see a "Send Email" button in the email list
   - Click it to open the dialog and test

#### How to Send

1. **Create a Temp Email**
   - Create a new temporary email on the Mailbox page

2. **Send an Email**
   - Find the email in the list
   - Click the "Send Email" button next to it
   - Fill in:
     - Recipient address
     - Subject
     - Content (HTML supported)
   - Click "Send"

3. **View History**
   - Sent emails are saved in the message list of the corresponding mailbox
   - View all sent and received emails in the mailbox detail page

#### Notes

- 📋 **Resend Limits**: Please note Resend's sending limits and pricing
- 🔐 **Domain Verification**: Using custom domains requires verification in Resend
- 🚫 **Anti-Spam**: Please follow email sending standards and avoid spam
- 📊 **Quota Monitoring**: The system counts daily usage automatically and stops sending when the limit is reached
- 🔄 **Quota Reset**: The daily quota resets at 00:00 every day

### Webhook Integration

When a new email is received, the system sends a POST request to the configured and enabled Webhook URL. Both the request body and headers are defined by the user in the profile page.

#### Request Body

The request body is generated from the template the user provides, using placeholders to reference the email data:

| Placeholder | Description |
| --- | --- |
| `{{event}}` | Trigger event name, currently `new_message` |
| `{{subject}}` | Email subject |
| `{{fromAddress}}` | Sender address |
| `{{toAddress}}` | Recipient address |
| `{{receivedAt}}` | Received time (ISO string) |
| `{{content}}` | Plain text body |
| `{{html}}` | HTML body |
| `{{emailId}}` | Email ID |
| `{{messageId}}` | Message ID |
| `{{markdown}}` | Body as Markdown |

Example template:

```json
{
  "event": "{{event}}",
  "subject": "{{subject}}",
  "from": "{{fromAddress}}",
  "content": "{{content}}"
}
```

Placeholder values are JSON-escaped during rendering, so they can be safely placed inside JSON strings (quotes and line breaks in the email do not break the structure). For readability, JSON strings in the template may also contain real line breaks; before sending, the system strips the common indentation of continuation lines and escapes the line breaks to `\n`. When the template is left empty, the system sends the following generic email data JSON:

```json
{
  "emailId": "email-uuid",
  "messageId": "message-uuid",
  "fromAddress": "sender@example.com",
  "subject": "Email Subject",
  "content": "Email Text Content",
  "html": "Email HTML Content",
  "receivedAt": "2024-01-01T12:00:00.000Z",
  "toAddress": "your-email@moemail.app"
}
```

#### Request Headers

Request headers are also configured by the user. A `Content-Type: application/json` header is included by default and can be edited or removed. Header values support the placeholders above and are substituted as-is without JSON escaping.

```http
Content-Type: application/json
Authorization: Bearer your-token
```

Headers controlled by the runtime or forbidden by the spec, such as `Host`, `Content-Length`, `Connection`, and `User-Agent`, cannot be set.

#### Configuration

1. Click your avatar to enter the User Profile
2. Enable Webhook
3. Set the notification URL
4. Fill in the request body template (optional) and request headers
5. Click the Test button to verify the configuration
6. Save to start receiving new email notifications

#### Testing

The project provides a simple test server:

```bash
pnpm webhook-test-server
```

The test server starts a local HTTP server on port 3001 ([http://localhost:3001](http://localhost:3001)) and prints the details of received Webhook requests.

For external testing, expose the service with Cloudflare Tunnel:

```bash
pnpx cloudflared tunnel --url http://localhost:3001
```

#### Notes

- The Webhook endpoint should respond within 10 seconds
- Failed requests or non-2xx responses trigger a retry, up to 3 attempts
- Failed deliveries are only logged; they are not retried automatically or turned into in-app notifications

### Notification Center & Broadcast

A **system inbox** is created automatically when a user logs in for the first time. It is pinned to the top of the email list, does not count toward the email quota, and cannot be deleted.

The system inbox receives the following in-app notifications:

- Welcome message
- Role change
- Password reset
- Sending quota adjustment
- Available domain change

The Emperor can publish **system broadcasts** from the User Profile to the whole site or a specific role. Broadcasts are processed in batches of 100 users to avoid overly long requests.

### Email Sharing

Both email details and individual messages support share links:

- Validity options: 1 hour, 24 hours, 3 days, or permanent
- Share links can be accessed anonymously without logging in
- Access only validates the share token; a missing link returns 404 and an expired link returns 410
- Generated links can be viewed and deleted in share management; deletion takes effect immediately

## API Reference

The project provides OpenAPI endpoints accessible via API Key. API Keys can be created in the User Profile (requires the Duke or Emperor role).

API Keys can only access `/api/emails`, `/api/config`, and `/api/mcp`; role management, API Key management, Webhook configuration, and other endpoints only support login sessions and do not accept API Keys.

### Authentication

Add the API Key to the request header:

```http
X-API-Key: YOUR_API_KEY
```

### Endpoint Overview

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/config` | Get system configuration |
| `POST` | `/api/config` | Update system configuration (requires system settings permission) |
| `POST` | `/api/emails/generate` | Create a temporary email |
| `GET` | `/api/emails` | List emails (`?type=system` returns only the system inbox) |
| `DELETE` | `/api/emails/{emailId}` | Delete an email |
| `GET` | `/api/emails/{emailId}` | List messages of an email (`?type=sent` returns only sent messages) |
| `GET` | `/api/emails/{emailId}/{messageId}` | Get a single message |
| `DELETE` | `/api/emails/{emailId}/{messageId}` | Delete a single message |
| `POST` | `/api/emails/{emailId}/share` | Create an email share link |
| `GET` | `/api/emails/{emailId}/share` | List share links of an email |
| `DELETE` | `/api/emails/{emailId}/share/{shareId}` | Delete an email share link |
| `POST` | `/api/emails/{emailId}/messages/{messageId}/share` | Create a message share link |
| `GET` | `/api/emails/{emailId}/messages/{messageId}/share` | List share links of a message |
| `DELETE` | `/api/emails/{emailId}/messages/{messageId}/share/{shareId}` | Delete a message share link |

### System Configuration

```http
GET /api/config
```

Response:

```json
{
  "defaultRole": "CIVILIAN",
  "emailDomains": "moemail.app,example.com",
  "adminContact": "admin@example.com",
  "maxEmails": "10",
  "turnstile": {
    "enabled": false,
    "siteKey": "",
    "secretKey": ""
  }
}
```

| Field | Description |
| --- | --- |
| `defaultRole` | Default role for new users; values: `CIVILIAN`, `KNIGHT`, `DUKE` |
| `emailDomains` | Supported email domains, comma-separated |
| `adminContact` | Administrator contact information |
| `maxEmails` | Maximum number of emails per user |
| `turnstile` | Turnstile configuration, returned only to callers with system settings permission |

#### Update System Configuration

```http
POST /api/config
Content-Type: application/json

{
  "defaultRole": "CIVILIAN",
  "emailDomains": "moemail.app,example.com",
  "adminContact": "admin@example.com",
  "maxEmails": "10",
  "turnstile": {
    "enabled": false,
    "siteKey": "",
    "secretKey": ""
  }
}
```

Requires system settings permission. Returns `{ "success": true }`.

### Email Management

#### Create a Temporary Email

```http
POST /api/emails/generate
Content-Type: application/json

{
  "name": "test",
  "expiryTime": 3600000,
  "domain": "moemail.app"
}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | No | Email prefix |
| `expiryTime` | number | No | Validity in milliseconds: `3600000` (1 hour), `86400000` (1 day), `259200000` (3 days), `0` (permanent) |
| `domain` | string | No | Email domain; available from `/api/config` |

Response:

```json
{
  "id": "email-uuid-123",
  "email": "test@moemail.app"
}
```

| Field | Description |
| --- | --- |
| `id` | Unique identifier of the email |
| `email` | Created email address |

#### List Emails

```http
GET /api/emails?cursor=xxx
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `cursor` | string | No | Pagination cursor |
| `type` | string | No | When set to `system`, returns only the system inbox |

Response:

```json
{
  "emails": [
    {
      "id": "email-uuid-123",
      "address": "test@moemail.app",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "expiresAt": "2024-01-02T12:00:00.000Z",
      "userId": "user-uuid-456"
    }
  ],
  "nextCursor": "encoded-cursor-string",
  "total": 5
}
```

| Field | Description |
| --- | --- |
| `emails` | Array of emails |
| `nextCursor` | Cursor for the next page |
| `total` | Total number of emails |

#### Delete an Email

```http
DELETE /api/emails/{emailId}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |

Response:

```json
{
  "success": true
}
```

| Field | Description |
| --- | --- |
| `success` | Whether the deletion succeeded |

### Messages

#### List Messages of an Email

```http
GET /api/emails/{emailId}?cursor=xxx
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `cursor` | string | No | Pagination cursor |
| `type` | string | No | When set to `sent`, returns only sent messages and requires sending permission |

Response:

```json
{
  "messages": [
    {
      "id": "message-uuid-789",
      "from_address": "sender@example.com",
      "to_address": "test@moemail.app",
      "subject": "Email Subject",
      "content": "Email Text Content",
      "html": "<p>Email HTML Content</p>",
      "sent_at": 1704110400000,
      "received_at": 1704110400000
    }
  ],
  "nextCursor": "encoded-cursor-string",
  "total": 3
}
```

| Field | Description |
| --- | --- |
| `messages` | Array of messages, at most 20 per page |
| `nextCursor` | Cursor for the next page |
| `total` | Total number of messages |

Fields of each message:

| Field | Description |
| --- | --- |
| `id` | Unique identifier of the message |
| `from_address` | Sender email address |
| `to_address` | Recipient email address |
| `subject` | Email subject |
| `content` | Plain text content |
| `html` | HTML content |
| `sent_at` | Sent time (timestamp) |
| `received_at` | Received time (timestamp) |

> When querying sent messages with `?type=sent`, sending permission is required.

#### Get a Single Message

```http
GET /api/emails/{emailId}/{messageId}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `messageId` | string | Yes | Unique identifier of the message |

Response:

```json
{
  "message": {
    "id": "message-uuid-789",
    "from_address": "sender@example.com",
    "to_address": "test@moemail.app",
    "subject": "Email Subject",
    "content": "Email Text Content",
    "html": "<p>Email HTML Content</p>",
    "received_at": 1704110400000,
    "sent_at": 1704110400000,
    "type": "received"
  }
}
```

| Field | Description |
| --- | --- |
| `message` | Message detail object |
| `id` | Unique identifier of the message |
| `from_address` | Sender email address |
| `to_address` | Recipient email address |
| `subject` | Email subject |
| `content` | Plain text content |
| `html` | HTML content |
| `received_at` | Received time (timestamp) |
| `sent_at` | Sent time (timestamp) |
| `type` | Message type: `received` or `sent` |

#### Delete a Single Message

```http
DELETE /api/emails/{emailId}/{messageId}
```

| Parameter | Type | Required | Description |
| --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `messageId` | string | Yes | Unique identifier of the message |

Response:

```json
{
  "success": true
}
```

| Field | Description |
| --- | --- |
| `success` | Whether the deletion succeeded |

### Share Links

#### Create an Email Share Link

```http
POST /api/emails/{emailId}/share
Content-Type: application/json

{
  "expiresIn": 86400000
}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `expiresIn` | number | No | Share link validity in milliseconds: `3600000` (1 hour), `86400000` (1 day), `259200000` (3 days), `0` (permanent) |

Response:

```json
{
  "id": "share-uuid-123",
  "emailId": "email-uuid-123",
  "token": "abc123def456",
  "expiresAt": "2024-01-02T12:00:00.000Z",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

| Field | Description |
| --- | --- |
| `id` | Unique identifier of the share record |
| `emailId` | ID of the associated email |
| `token` | Access token of the share link |
| `expiresAt` | Expiry time of the share link; `null` means permanent |
| `createdAt` | Creation time |

Share link URL: `https://your-domain.com/shared/{token}`

#### List Email Share Links

```http
GET /api/emails/{emailId}/share
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |

Response:

```json
{
  "shares": [
    {
      "id": "share-uuid-123",
      "emailId": "email-uuid-123",
      "token": "abc123def456",
      "expiresAt": "2024-01-02T12:00:00.000Z",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

| Field | Description |
| --- | --- |
| `shares` | Array of share links |
| `total` | Total number of share links |

#### Delete an Email Share Link

```http
DELETE /api/emails/{emailId}/share/{shareId}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `shareId` | string | Yes | Unique identifier of the share record |

Response:

```json
{
  "success": true
}
```

| Field | Description |
| --- | --- |
| `success` | Whether the deletion succeeded |

#### Create a Message Share Link

```http
POST /api/emails/{emailId}/messages/{messageId}/share
Content-Type: application/json

{
  "expiresIn": 86400000
}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `messageId` | string | Yes | Unique identifier of the message |
| `expiresIn` | number | No | Share link validity in milliseconds: `3600000` (1 hour), `86400000` (1 day), `259200000` (3 days), `0` (permanent) |

Response:

```json
{
  "id": "share-uuid-456",
  "messageId": "message-uuid-789",
  "token": "xyz789ghi012",
  "expiresAt": "2024-01-02T12:00:00.000Z",
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

| Field | Description |
| --- | --- |
| `id` | Unique identifier of the share record |
| `messageId` | ID of the associated message |
| `token` | Access token of the share link |
| `expiresAt` | Expiry time of the share link; `null` means permanent |
| `createdAt` | Creation time |

Share link URL: `https://your-domain.com/shared/message/{token}`

#### List Message Share Links

```http
GET /api/emails/{emailId}/messages/{messageId}/share
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `messageId` | string | Yes | Unique identifier of the message |

Response:

```json
{
  "shares": [
    {
      "id": "share-uuid-456",
      "messageId": "message-uuid-789",
      "token": "xyz789ghi012",
      "expiresAt": "2024-01-02T12:00:00.000Z",
      "createdAt": "2024-01-01T12:00:00.000Z"
    }
  ],
  "total": 1
}
```

| Field | Description |
| --- | --- |
| `shares` | Array of share links |
| `total` | Total number of share links |

#### Delete a Message Share Link

```http
DELETE /api/emails/{emailId}/messages/{messageId}/share/{shareId}
```

| Parameter | Type | Required | Description |
| --- | --- | --- | --- |
| `emailId` | string | Yes | Unique identifier of the email |
| `messageId` | string | Yes | Unique identifier of the message |
| `shareId` | string | Yes | Unique identifier of the share record |

Response:

```json
{
  "success": true
}
```

| Field | Description |
| --- | --- |
| `success` | Whether the deletion succeeded |

### Usage Examples

Create a temporary email with curl:

```bash
curl -X POST https://your-domain.com/api/emails/generate \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test",
    "expiryTime": 3600000,
    "domain": "moemail.app"
  }'
```

Get the message list with JavaScript:

```javascript
const res = await fetch('https://your-domain.com/api/emails/your-email-id', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
});
const data = await res.json();
```

Create an email share link with curl:

```bash
curl -X POST https://your-domain.com/api/emails/your-email-id/share \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "expiresIn": 86400000
  }'
```

Create a message share link with JavaScript:

```javascript
const res = await fetch('https://your-domain.com/api/emails/your-email-id/messages/your-message-id/share', {
  method: 'POST',
  headers: {
    'X-API-Key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    expiresIn: 0  // permanent
  })
});
const data = await res.json();
console.log('Share link:', `https://your-domain.com/shared/message/${data.token}`);
```

## MCP Built-in Cloud Service

The project includes an MCP service deployed alongside the backend on the same domain. It goes live automatically when you push to Git. Clients need no local dependencies; just configure a URL to connect. It supports MCP clients such as Trae, Claude Desktop, and Cursor.

- **Endpoint**: `https://<your-domain>/api/mcp`
- **Transport**: Streamable HTTP (JSON-RPC 2.0), supports `POST` and CORS preflight
- **Authentication**: use an API Key created in the User Profile, passed in one of three ways
  - Header `X-API-Key: <API_KEY>`
  - Header `Authorization: Bearer <API_KEY>`
  - URL query parameter `?key=<API_KEY>` (only when the client does not support custom headers)

> The permission scope of an API Key is determined by the owner's role: regular users can only operate their own mailboxes; role management, user management, and similar endpoints still only accept login sessions, while configuration changes require the corresponding system settings permission.

### Tools

| Tool | Description |
| --- | --- |
| `get_config` | Read site configuration (available domains, email limit, sending service status) |
| `create_email` | Create a temporary email (1h / 24h / 3d / permanent) |
| `list_emails` | List temporary emails owned by the current user |
| `list_messages` | List messages of an email (received / sent / all) |
| `read_message` | Read the plain text and HTML of a single message |
| `wait_for_email` | Poll for a new email (waits 20 seconds by default, adjustable via `timeout_seconds`, max 25 seconds; returns `status: timeout` on timeout and can be called again) |
| `send_email` | Send an email from a temporary email |
| `delete_message` | Delete a single message |
| `delete_email` | Delete a temporary email |

### Client Configuration Examples

For clients that support `mcpServers` configuration, such as Claude Desktop and Cursor:

```json
{
  "mcpServers": {
    "moemail": {
      "url": "https://<your-domain>/api/mcp",
      "headers": {
        "X-API-Key": "YOUR_API_KEY"
      }
    }
  }
}
```

For clients that only support a URL, append the Key to the URL:

```text
https://<your-domain>/api/mcp?key=YOUR_API_KEY
```

For IDE clients such as Trae, add a custom service in the MCP marketplace, choose the `HTTP` / `Streamable HTTP` type, and fill in the URL and headers above.

### Self-check

```bash
curl https://<your-domain>/api/mcp \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

### Known Limitations

- The server does not provide SSE long connections: `GET /api/mcp` returns 405; clients can use `POST` with a one-shot response
- `wait_for_email` waits 20 seconds by default and up to 25 seconds per call (limited by edge function execution time); on timeout it returns `status: timeout`, and another call continues waiting
- The `?key=` method exposes the API Key in URLs and access logs; prefer passing it in headers
- The endpoint only performs mailbox-related operations and does not expose write endpoints such as configuration changes or role management

## Contributing

Welcome to submit Pull Requests or Issues to help improve this project.

## License

[MIT](LICENSE)

## Community

<table>
  <tr style="max-width: 360px">
    <td>
      <img src="https://pic.otaku.ren/20250309/AQADAcQxGxQjaVZ-.jpg" />
    </td>
    <td>
      <img src="https://pic.otaku.ren/20250309/AQADCMQxGxQjaVZ-.jpg" />
    </td>
  </tr>
  <tr style="max-width: 360px">
    <td>
      Follow the official account for more project updates and news about AI, blockchain, and indie development.
    </td>
    <td>
      Add the WeChat contact and mention "MoeMail" to join the WeChat community group.
    </td>
  </tr>
</table>

## Support

If you like this project, please give it a Star ⭐️, or sponsor it.

<br />
<br />
<img src="https://pic.otaku.ren/20240212/AQADPrgxGwoIWFZ-.jpg" style="width: 400px;" />
<br />
<br />
<a href="https://www.buymeacoffee.com/beilunyang" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" style="width: 400px;" ></a>

## Star History

<a href="https://www.star-history.com/#beilunyang/moemail&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=beilunyang/moemail&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=beilunyang/moemail&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=beilunyang/moemail&type=Date" />
 </picture>
</a>
