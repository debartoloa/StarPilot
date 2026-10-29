/**
 * CosmoPilot / StarWay - Object Identification Game
 * Points telescope at random visible target and prompts user to guess the object.
 */

class GameService {
  constructor(catalogService, bleController, astronomyService) {
    this.catalog = catalogService;
    this.ble = bleController;
    this.astro = astronomyService;

    this.highScoreKey = 'cosmopilot_game_highscore';
    this.highScore = parseInt(localStorage.getItem(this.highScoreKey) || '50', 10);

    // Active game state
    this.isPlaying = false;
    this.maxMag = 5.0; // min 5.0
    this.score = 50;
    this.streak = 0;
    this.lifelines5050 = 5;
    this.lifelinesSkip = 3;

    this.currentTarget = null;
    this.options = []; // 3 answer options { id, name, isCorrect, eliminated }
    this.hasAnswered = false;
    this.showMagHint = false;
  }

  startGame(maxMag = 5.0) {
    this.isPlaying = true;
    this.maxMag = Math.max(5.0, parseFloat(maxMag) || 5.0);
    this.score = 50;
    this.streak = 0;
    this.lifelines5050 = 5;
    this.lifelinesSkip = 3;

    return this.nextRound();
  }

  nextRound() {
    this.hasAnswered = false;
    this.showMagHint = false;

    // Pick random visible target with mag <= maxMag
    this.currentTarget = this.catalog.getRandomVisibleTarget(this.maxMag);

    // Generate 2 plausible distractors from the fixed catalogs
    const fixedObjects = [...this.catalog.starsCatalog, ...this.catalog.galaxiesCatalog, ...this.catalog.nebulaeCatalog, ...this.catalog.messierCatalog]
      .filter(o => o.name !== this.currentTarget.name);

    // Shuffle and pick 2
    const shuffled = [...fixedObjects].sort(() => 0.5 - Math.random());
    const distractors = shuffled.slice(0, 2);

    const rawOptions = [
      { id: this.currentTarget.id, name: this.currentTarget.name, isCorrect: true, eliminated: false },
      { id: distractors[0].id, name: distractors[0].name, isCorrect: false, eliminated: false },
      { id: distractors[1].id, name: distractors[1].name, isCorrect: false, eliminated: false }
    ];

    // Shuffle options order
    this.options = rawOptions.sort(() => 0.5 - Math.random());

    // Slew telescope automatically to target (without confirmation dialog, as per page 21)
    if (this.ble.isConnected) {
      const hms = this.astro.decimalRaToHms(this.currentTarget.raHours);
      const dms = this.astro.decimalDecToDms(this.currentTarget.decDeg);
      this.ble.gotoCoordinates(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
    }

    return {
      roundTarget: this.currentTarget,
      options: this.options,
      score: this.score,
      streak: this.streak,
      lifelines5050: this.lifelines5050,
      lifelinesSkip: this.lifelinesSkip
    };
  }

  use5050() {
    if (this.lifelines5050 <= 0 || this.hasAnswered) return false;
    // Find incorrect options that are not yet eliminated
    const incorrect = this.options.filter(o => !o.isCorrect && !o.eliminated);
    if (incorrect.length > 0) {
      incorrect[0].eliminated = true;
      this.lifelines5050--;
      return true;
    }
    return false;
  }

  useShowMag() {
    if (this.hasAnswered) return null;
    this.showMagHint = true;
    return this.currentTarget ? this.currentTarget.mag : null;
  }

  useSkip() {
    if (this.lifelinesSkip <= 0 || this.hasAnswered) return false;
    this.lifelinesSkip--;
    this.streak = 0; // Skip resets streak
    return this.nextRound();
  }

  submitAnswer(selectedOptionId) {
    if (this.hasAnswered || !this.currentTarget) return null;
    this.hasAnswered = true;

    const chosen = this.options.find(o => o.id === selectedOptionId);
    const isCorrect = chosen && chosen.isCorrect;

    if (isCorrect) {
      this.streak++;
      let gained = 10;
      // Every 3rd consecutive correct answer adds 2 more
      if (this.streak > 0 && this.streak % 3 === 0) {
        gained += 2;
      }
      this.score += gained;

      if (this.score > this.highScore) {
        this.highScore = this.score;
        localStorage.setItem(this.highScoreKey, this.highScore.toString());
      }
    } else {
      this.streak = 0;
      this.score -= 20;
    }

    const isGameOver = this.score <= 0;
    if (isGameOver) {
      this.isPlaying = false;
    }

    return {
      isCorrect,
      correctName: this.currentTarget.name,
      score: this.score,
      streak: this.streak,
      isGameOver,
      highScore: this.highScore
    };
  }

  reCenterTarget() {
    if (this.currentTarget && this.ble.isConnected) {
      const hms = this.astro.decimalRaToHms(this.currentTarget.raHours);
      const dms = this.astro.decimalDecToDms(this.currentTarget.decDeg);
      this.ble.gotoCoordinates(hms.h, hms.m, hms.s, dms.d, dms.m, dms.s);
      return true;
    }
    return false;
  }

  endGame() {
    this.isPlaying = false;
    const finalScore = this.score;
    if (finalScore > this.highScore) {
      this.highScore = finalScore;
      localStorage.setItem(this.highScoreKey, this.highScore.toString());
    }
    return {
      finalScore,
      highScore: this.highScore
    };
  }
}

window.GameService = GameService;
window.gameService = new GameService(window.catalogService, window.bleController, window.astronomyService);
