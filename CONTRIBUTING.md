# Contributing to Steam Cross-Platform Wishlist

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Chrome browser for testing

### Setup

```bash
# Clone the repository
git clone https://github.com/keyunjie96/steam-cross-platform-wishlist
cd steam-cross-platform-wishlist

# Install dependencies
npm install

# Build the extension
npm run build
```

### Loading the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the project folder

### Development Workflow

```bash
npm run build        # Compile TypeScript to dist/
npm run build:watch  # Watch mode for development
npm run typecheck    # Type check without emitting
npm run test:unit    # Run unit tests
npm run test:coverage # Full coverage report
```

## How to Contribute

### Reporting Bugs

Before opening an issue:
1. Search existing issues to avoid duplicates
2. Test with the latest version
3. Disable other extensions to rule out conflicts

When reporting:
- Describe what you expected vs. what happened
- Include browser version and extension version
- Include relevant console errors (F12 > Console)
- Note which Steam wishlist page(s) show the issue

### Suggesting Features

Open an issue with:
- Clear description of the feature
- Why it would be useful
- Any implementation ideas you have

Note: We focus on platform availability and game metadata. Features covered by existing extensions (Augmented Steam, SteamDB) are generally declined.

### Submitting Code

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/your-feature`
3. **Make your changes**
4. **Run tests**: `npm run test:unit`
5. **Run type check**: `npm run typecheck`
6. **Commit with clear message**
7. **Push and open a Pull Request**

## Code Style

### TypeScript

- Use strict TypeScript (enabled in `tsconfig.json`)
- Prefer explicit types over `any`
- Use interfaces for object shapes

### Naming

- **Files**: `camelCase.ts`
- **Classes**: `PascalCase`
- **Functions/variables**: `camelCase`
- **Constants**: `SCREAMING_SNAKE_CASE`

### Logging

Use the logging prefix convention:
```typescript
const LOG_PREFIX = '[SCPW ModuleName]';
console.log(`${LOG_PREFIX} message`);
```

### Debug Flags

Each module has a debug flag:
```typescript
const DEBUG = false;  // Set to true during development
```

**Important:** Always set `DEBUG = false` before committing.

## Testing

### Requirements

- All new code must have tests
- Coverage thresholds must be maintained (see `jest.config.js`)
- Tests must pass before PR can be merged

### Running Tests

```bash
npm run test:unit       # Fast, for development
npm run test:integration # Full integration tests (slower)
npm run test:coverage   # Coverage report
```

### Writing Tests

Tests live in `tests/` and follow the pattern `*.test.ts`.

```typescript
describe('ModuleName', () => {
  describe('functionName', () => {
    it('should handle normal case', () => {
      // Arrange
      // Act
      // Assert
    });

    it('should handle edge case', () => {
      // ...
    });
  });
});
```

## Pull Request Process

1. **Title**: Clear, concise description of the change
2. **Description**: Explain what and why
3. **Tests**: Include tests for new functionality
4. **Documentation**: Update relevant docs if needed
5. **One concern per PR**: Keep PRs focused

### Checklist

Before submitting:
- [ ] Code compiles (`npm run build`)
- [ ] Tests pass (`npm run test:unit`)
- [ ] Types check (`npm run typecheck`)
- [ ] Debug flags are `false`
- [ ] No console.log spam in production code
- [ ] Follows existing code style

## Project Structure

```
src/
├── content.ts          # Content script (runs on Steam pages)
├── background.ts       # Service worker (message routing)
├── resolver.ts         # Data resolution orchestrator
├── wikidataClient.ts   # Wikidata SPARQL queries
├── hltbClient.ts       # HLTB API client
├── steamDeckClient.ts  # Steam Deck data extraction
├── cache.ts            # Chrome storage wrapper
├── icons.ts            # SVG icon definitions
├── types.ts            # TypeScript type definitions
├── options.ts          # Options page logic
└── options.html        # Options page UI

tests/
├── *.test.ts           # Unit tests
└── integration/        # Integration tests
```

## Architecture Notes

- **Content Script**: Runs on Steam pages, injects icons
- **Service Worker**: Handles background tasks, message routing
- **Resolver**: Orchestrates cache lookups and API calls
- **Clients**: Isolated modules for each data source

See `CLAUDE.md` for detailed architecture documentation.

## Questions?

- Open an issue for general questions
- Check existing issues and docs first
- Be patient - maintainers have limited time

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
