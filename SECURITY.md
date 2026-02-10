# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 0.x.x   | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability within Zeude, please send an email to [dev@zep.us](mailto:dev@zep.us). All security vulnerabilities will be promptly addressed.

Please include the following information in your report:

- **Type of issue** (e.g., buffer overflow, SQL injection, cross-site scripting, etc.)
- **Full paths of source file(s)** related to the manifestation of the issue
- **Location of the affected source code** (tag/branch/commit or direct URL)
- **Any special configuration** required to reproduce the issue
- **Step-by-step instructions** to reproduce the issue
- **Proof-of-concept or exploit code** (if possible)
- **Impact of the issue**, including how an attacker might exploit it

### Response Timeline

- **Initial Response**: Within 48 hours of receiving the report
- **Status Update**: Within 7 days with our assessment
- **Resolution Target**: Within 90 days for most issues

We will keep you informed of the progress toward a fix and full announcement.

## Security Best Practices

When deploying and using Zeude, we recommend the following security practices:

### Credential Management

- **Never commit credentials** to version control
- Store all secrets in environment variables or a secure secret management system
- Use `.env` files only for local development, and never commit them
- Rotate API keys and credentials regularly
- Use the principle of least privilege when creating service accounts

### Agent Keys

- Generate unique agent keys for each user or deployment
- Regularly audit and rotate agent keys
- Revoke compromised or unused agent keys immediately
- Store agent keys securely (they are stored with 0600 permissions by default)

### Network Security

- Always use HTTPS for dashboard access
- Configure proper CORS settings for your deployment
- Use a reverse proxy (nginx, Caddy) with proper TLS configuration
- Implement rate limiting to prevent abuse
- Consider using a Web Application Firewall (WAF)

### Infrastructure Security

- Keep Supabase and ClickHouse instances up to date
- Use private networking where possible
- Enable audit logging in your database systems
- Regularly backup your data
- Implement proper access controls for infrastructure

### Deployment Checklist

Before deploying Zeude in production:

- [ ] All default passwords changed
- [ ] Environment variables properly configured
- [ ] HTTPS enabled with valid certificates
- [ ] Database connections use SSL/TLS
- [ ] Firewall rules configured
- [ ] Access logging enabled
- [ ] Backup strategy in place
- [ ] Monitoring and alerting configured

## Disclosure Policy

When we receive a security bug report, we will:

1. Confirm the problem and determine affected versions
2. Audit code to find any similar problems
3. Prepare fixes for all supported versions
4. Release new versions and announce the fix

We credit reporters who help us improve Zeude's security (unless they prefer to remain anonymous).

## Security Updates

Security updates will be released as:

- **Patch releases** for backward-compatible security fixes
- **GitHub Security Advisories** for critical vulnerabilities
- **Announcements** on our GitHub repository

To stay informed:

- Watch the repository for releases
- Enable GitHub security alerts for your fork
- Subscribe to our security mailing list (if available)

## Bug Bounty

Currently, we do not offer a paid bug bounty program. However, we greatly appreciate security researchers who responsibly disclose vulnerabilities to us. We will acknowledge your contribution in our release notes and security advisories (with your permission).

## Contact

For any security-related questions or concerns:

- **Security Reports**: [dev@zep.us](mailto:dev@zep.us)
- **General Security Questions**: [dev@zep.us](mailto:dev@zep.us)
- **Enterprise Security**: [jaegyu.lee@zep.us](mailto:jaegyu.lee@zep.us)

## Security Features

Zeude includes the following security features:

### Authentication & Authorization

- Bearer token authentication for all API calls
- Agent key-based authentication for CLI
- Role-based access control in dashboard

### Data Protection

- Credentials stored with restrictive file permissions (0600)
- Minimal credential exposure in logs (agent keys redacted)
- Encrypted connections to Supabase and ClickHouse

### Audit & Monitoring

- Comprehensive logging capabilities
- Prompt history tracking for audit purposes
- Configuration change tracking

---

Thank you for helping keep Zeude and its users safe!
