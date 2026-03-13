const fs = require('fs');

const code = fs.readFileSync('src/game/scenes/GameScene.ts', 'utf8');
const classEndIdx = code.lastIndexOf('}');

const newMethods = `
  // --- UI Overlays & State ---
  private setupUI() {
    const btnBegin = document.getElementById('btn-begin-rite');
    if (btnBegin) {
      btnBegin.onclick = () => {
        document.getElementById('main-menu')?.classList.add('hidden');
        this.resetGame();
        this.gameState = 'PLAYING';
        audioManager.playSfx('menuSelect');
      };
    }

    const btnResume = document.getElementById('btn-resume-rite');
    if (btnResume) {
      btnResume.onclick = () => this.togglePause();
    }

    const btnAbandon = document.getElementById('btn-abandon-rite');
    if (btnAbandon) {
      btnAbandon.onclick = () => {
        this.abandonRun();
      };
    }
  }

  private togglePause() {
    if (this.gameState === 'PLAYING') {
      this.gameState = 'PAUSED';
      this.openPauseMenu();
      audioManager.playSfx('menuSelect'); // Assuming a sound like this exists
    } else if (this.gameState === 'PAUSED') {
      this.gameState = 'PLAYING';
      this.closePauseMenu();
      audioManager.playSfx('menuSelect');
    }
  }

  private openPauseMenu() {
    const pauseScreen = document.getElementById('pause-screen');
    const grimoireList = document.getElementById('grimoire-list');
    if (!pauseScreen || !grimoireList) return;

    // Populate active pacts
    grimoireList.innerHTML = '';
    
    if (this.activeVexes.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'grimoire-pact';
      msg.style.gridColumn = '1 / -1';
      msg.style.textAlign = 'center';
      msg.textContent = 'The altar is clean. No pacts have been struck.';
      grimoireList.appendChild(msg);
    } else {
      this.activeVexes.forEach(vex => {
        const pact = document.createElement('div');
        pact.className = 'grimoire-pact';
        
        const roman = ['I', 'II', 'III'][vex.rank - 1] || vex.rank;
        const title = document.createElement('h3');
        title.textContent = \`\${vex.name} \${roman}\`;
        
        const desc = document.createElement('div');
        desc.textContent = vex.description;

        const flavorText = FLAVOR_TEXT_BY_VEX_ID[vex.id]?.(vex.rank as any) || '';
        const flavor = document.createElement('span');
        flavor.className = 'flavor';
        flavor.textContent = flavorText;

        pact.appendChild(title);
        pact.appendChild(desc);
        if (flavorText) pact.appendChild(flavor);

        grimoireList.appendChild(pact);
      });
    }

    pauseScreen.classList.remove('hidden');
    // Hide canvas to completely cover the gameplay as requested
    this.sys.game.canvas.style.display = 'none';
  }

  private closePauseMenu() {
    const pauseScreen = document.getElementById('pause-screen');
    if (pauseScreen) pauseScreen.classList.add('hidden');
    // Bring canvas back
    this.sys.game.canvas.style.display = 'block';
  }

  private abandonRun() {
    this.closePauseMenu();
    document.getElementById('main-menu')?.classList.remove('hidden');
    // Reset state but keep in MENU
    this.resetGame();
    this.gameState = 'MENU';
  }
`;

const updatedCode = code.slice(0, classEndIdx) + newMethods + code.slice(classEndIdx);
fs.writeFileSync('src/game/scenes/GameScene.ts', updatedCode, 'utf8');
