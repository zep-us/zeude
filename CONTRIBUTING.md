# Contributing to Zeude

First off, thank you for considering contributing to Zeude! It's people like you that make Zeude such a great tool.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Community](#community)

## Code of Conduct

This project and everyone participating in it is governed by our Code of Conduct. By participating, you are expected to uphold this code. Please report unacceptable behavior to [dev@zep.us](mailto:dev@zep.us).

### Our Pledge

We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

Examples of behavior that contributes to creating a positive environment:

- Using welcoming and inclusive language
- Being respectful of differing viewpoints and experiences
- Gracefully accepting constructive criticism
- Focusing on what is best for the community
- Showing empathy towards other community members

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Go 1.21+** (for CLI development)
- **Node.js 20+** (for dashboard development)
- **pnpm** (for package management)
- **Docker** (for local development environment)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/zeude.git
   cd zeude
   ```
3. Add the upstream remote:
   ```bash
   git remote add upstream https://github.com/ZEP-Inc/zeude.git
   ```

## Development Setup

### Dashboard (Next.js)

```bash
cd zeude/dashboard

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Edit .env.local with your credentials
# You'll need Supabase and ClickHouse credentials

# Start development server
pnpm dev
```

The dashboard will be available at `http://localhost:3000`.

### CLI (Go)

```bash
cd zeude/cmd

# Build the CLI
go build -o zeude-cli ./...

# Run tests
go test ./...
```

### Local Infrastructure

For local development with Supabase and ClickHouse:

```bash
# Using Docker Compose (if available)
docker compose -f zeude/deployments/docker-compose.dev.yml up -d
```

## How to Contribute

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include logs and error messages**
- **Include your environment details** (OS, Go version, Node.js version, etc.)

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the proposed enhancement**
- **Explain why this enhancement would be useful**
- **List any alternatives you've considered**

### Your First Code Contribution

Unsure where to begin? Look for issues labeled:

- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `documentation` - Documentation improvements

### Pull Requests

1. Create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes and commit them:
   ```bash
   git commit -m "feat: add amazing feature"
   ```

3. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

4. Open a Pull Request against the `main` branch

## Pull Request Process

1. **Update documentation**: Update the README.md or other docs if needed
2. **Add tests**: Include tests for new functionality
3. **Follow coding standards**: Ensure your code follows our style guidelines
4. **Write good commit messages**: Follow conventional commits format
5. **Request review**: Tag appropriate reviewers

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types:
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code changes that neither fix bugs nor add features
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(dashboard): add team analytics page
fix(cli): resolve sync timeout issue
docs: update installation instructions
```

## Coding Standards

### Go (CLI)

- Follow the official [Go Code Review Comments](https://github.com/golang/go/wiki/CodeReviewComments)
- Run `go fmt` before committing
- Run `go vet` to catch common mistakes
- Write tests for new functionality

### TypeScript/JavaScript (Dashboard)

- Use TypeScript for all new code
- Follow the ESLint configuration in the project
- Use functional components with hooks for React
- Write meaningful component and function names

### General Guidelines

- Write self-documenting code with clear variable/function names
- Add comments for complex logic
- Keep functions small and focused
- Handle errors appropriately
- Never commit secrets or credentials

## Security

If you discover a security vulnerability, please do NOT open a public issue. Instead, please report it privately to [dev@zep.us](mailto:dev@zep.us). See our [Security Policy](SECURITY.md) for more details.

## Community

- **GitHub Issues**: For bug reports and feature requests
- **GitHub Discussions**: For questions and general discussion
- **Email**: [dev@zep.us](mailto:dev@zep.us)

## License

By contributing to Zeude, you agree that your contributions will be licensed under the Apache License 2.0.

---

Thank you for contributing to Zeude! 🎉
