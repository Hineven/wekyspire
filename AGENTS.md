# AGENTS.md - 魏启尖塔 (Weiqi Spire)

This file provides essential information for AI coding agents working on this project.

## Project Overview

**魏启尖塔** is a single-player roguelike text adventure web game with a cultivation/xianxia theme. Players take on the role of a "灵御" (spirit controller) who battles increasingly powerful enemies while ascending a spire.

- **Game Type**: Roguelike, turn-based battle, card-based skill system
- **Language**: Chinese (primary language for documentation, comments, and UI)
- **Architecture**: Frontend-backend separated within the same codebase

## Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Vue 3 (Composition API) |
| Build Tool | Vite 4 |
| Language | JavaScript (ES2020+) |
| Graphics | PixiJS 7.0.5 (WebGL rendering) |
| Animation | GSAP 3.13.0 |
| State Management | Vue Reactive (no Vuex/Pinia) |
| Event Bus | mitt |
| Screenshot | html2canvas, @zumer/snapdom |
| Routing | vue-router 4 |

## Project Structure

```
wekyspire/
├── .github/workflows/      # CI/CD - GitHub Pages deployment
├── public/                 # Static assets
├── src/
│   ├── assets/            # Images, sounds, CSS
│   │   ├── cards/         # Card images
│   │   ├── enemies/       # Enemy sprites
│   │   ├── cutscenes/     # Story images
│   │   └── sounds/        # Audio files
│   ├── components/        # Vue components
│   │   ├── battle/        # Battle screen components
│   │   ├── cutscenes/     # Story/cutscene components
│   │   ├── global/        # Shared/global components
│   │   ├── rest/          # Rest/upgrade phase components
│   │   └── start/         # Title screen components
│   ├── data/              # Core game logic ("backend")
│   │   ├── combat/        # Battle system
│   │   │   ├── battleInstructions/  # Settlement instruction system
│   │   │   └── battle.js            # Battle flow control
│   │   ├── animation_sequencing/    # Animation sequencer
│   │   ├── skills/        # Skill definitions (if any)
│   │   ├── character.js   # Player/character classes
│   │   ├── enemy.js       # Enemy classes
│   │   ├── enemyFactory.js
│   │   ├── skillManager.js
│   │   ├── gameState.js   # Game state management
│   │   └── enums.js       # Game constants/enums
│   ├── scene_renderer/    # Scene rendering
│   ├── utils/             # Utility functions
│   ├── App.vue            # Root app (router view)
│   ├── GameApp.vue        # Main game app
│   ├── DebugApp.vue       # Debug interface
│   ├── main.js            # Entry point
│   ├── game.js            # Game flow initialization
│   ├── backendEventBus.js # Backend event bus
│   └── frontendEventBus.js# Frontend event bus
├── design/                # Design documents
├── story/                 # Story content
├── quest_prompts/         # Development proposals/plans
├── DESIGN.md              # Game design document (Chinese)
├── README.md              # Basic project info
└── package.json
```

## Build and Development Commands

```bash
# Install dependencies
npm install

# Start development server (localhost:5177)
npm run dev

# Build for production (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

## Architecture Overview

### Dual Event Bus System

The project uses two separate event buses for clean separation:

1. **backendEventBus** (`src/backendEventBus.js`): 
   - Game logic events
   - Player operations (skill usage, rest actions)
   - Battle flow events
   - Cross-module communication in the "backend"

2. **frontendEventBus** (`src/frontendEventBus.js`):
   - UI/Rendering events
   - Animation completion signals
   - User interaction responses

### Dual State System

Two reactive state objects (see `src/data/gameState.js`):

- **backendGameState**: Source of truth for game logic
- **displayGameState**: Mirror state for UI rendering

The `animationSequencer` synchronizes backend changes to the display state at appropriate times.

### Battle Settlement System

The battle system uses a sophisticated instruction-based settlement architecture:

- **BattleInstruction**: Abstract base class for settlement primitives
- **BattleInstructionExecutor**: Manages instruction stack, drives DFS traversal
- **Instructions**: Atomic operations (DealDamage, UseSkill, ConsumeResources, etc.)

Key features:
- Cancel propagation: Canceling a parent instruction cancels all children
- Async support: `AwaitPlayerInputInstruction` for player input during settlement
- Tree structure: Instructions can spawn child instructions

See `src/data/combat/battleInstructions/` for all instruction types.

### Animation Sequencer

`animationSequencer.js` manages the animation pipeline:
- Instruction-based animation queue
- Tags and waitTags for dependency management
- Parallel and sequential animation support
- Timeout-based completion fallback

## Code Conventions

### Naming
- Classes: PascalCase (e.g., `BattleInstruction`, `SkillManager`)
- Methods/Variables: camelCase
- Constants: UPPER_SNAKE_CASE for true constants
- Chinese is acceptable and common for game-specific terms

### File Organization
- Components: Organized by screen (battle/, rest/, start/, cutscenes/, global/)
- Instructions: Grouped by category (damage/, turn/, effect/, etc.)
- Utils: Functional utilities grouped by purpose

### Event Naming (in backendEventBus.js)
Events are organized by namespace:
- `Game.*`: Game lifecycle (GAME_START, ENTER_BATTLE_STAGE, etc.)
- `Player.*`: Player state changes
- `PlayerOperations.*`: Player-initiated actions
- `Battle.*`: Battle flow
- `Executor.*`: Settlement system hooks

## Key Modules

### Skill System (`src/data/skillManager.js`)
- Skills are classes extending the `Skill` base class
- Dynamic import/registration pattern
- Skills have tiers, types, series, and predecessor relationships
- Skills can spawn as rewards based on player state

### Battle Flow (`src/data/combat/battle.js`)
- `enterBattleStage()`: Battle initialization
- Turn-based system with player/enemy phases
- Integrates with instruction executor for settlement

### Game Flow (`src/game.js`)
- Initializes game flow listeners on backendEventBus
- Handles transitions between game stages (start → battle → rest → end)

## Development Guidelines

### Adding New Skills
1. Create a new file in appropriate subdirectory (e.g., `src/data/skills/martial_arts/`)
2. Extend the `Skill` base class
3. Implement required methods (`use`, `description`, etc.)
4. Export the class
5. Import and register in `skillManager.js`

### Adding New Battle Instructions
1. Extend `BattleInstruction` base class
2. Implement `execute()` method
3. Return `true` when complete, `false` to continue next tick
4. Use `submitInstruction()` to create child instructions
5. Consider cancel propagation via `parentInstruction`

### Working with Animations
- Use helpers from `animationInstructionHelpers.js`
- Enqueue animations through `animationSequencer`
- Tag animations appropriately for dependency management
- Listen for `animation-instruction-finished` on frontendEventBus

## Deployment

The project deploys to GitHub Pages via GitHub Actions:
- Trigger: Push to `master` branch
- Build output: `dist/` directory
- Base URL configured via `VITE_BASE` environment variable

See `.github/workflows/main.yml` for CI/CD configuration.

## Important Notes

1. **Language**: Primary documentation and code comments are in Chinese. Maintain this consistency.

2. **State Management**: Always modify `backendGameState` for logic; `displayGameState` is for rendering only.

3. **Settlement System**: The instruction-based settlement system is the modern approach. Older hardcoded settlement in `battleUtils.js` is being phased out.

4. **Animation Sync**: The display state updates are controlled by `animationSequencer`. Instant backend changes don't immediately reflect in UI.

5. **Skill Use vs Activate**: 
   - "Use" includes resource consumption + activation
   - "Activate" is just the skill effect execution
   - See `UseSkillInstruction` and `ActivateSkillInstruction`

## Design Documents

- `DESIGN.md`: Comprehensive game design (Chinese)
- `quest_prompts/BATTLE_INSTRUCTIONS_PROPOSAL.md`: Settlement system architecture
- `quest_prompts/NEW_BACKEND_LOGIC.md`: Backend refactoring goals

Read these for deep understanding of game mechanics and architecture decisions.

## Testing Strategy

Currently, there is no automated test suite. Testing is manual:
1. Run `npm run dev` for development testing
2. Use the `/debug` route (DebugApp.vue) for debugging features
3. Test specific skills by adding them to initial player skills in `game.js`

When modifying settlement logic, migrate one simple skill first to verify the new system works.
