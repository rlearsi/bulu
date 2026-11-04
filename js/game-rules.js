/**
 * Módulo de Regras do Jogo (Termo)
 * Responsável exclusivamente pelo dicionário, sorteio de palavras e avaliação de palpites.
 */

export class GameRules {
  constructor(wordsList, wordLength = 5, secretWordsList = null) {
    this.wordsList = wordsList;
    this.secretWordsList = Array.isArray(secretWordsList) && secretWordsList.length > 0
      ? secretWordsList
      : wordsList;
    this.wordLength = wordLength;
    this.validWordsSet = new Set(this.wordsList.map(w => (w.normalized || w.word).toUpperCase()));
  }

  getRandomSecretWord() {
    const randomIndex = Math.floor(Math.random() * this.secretWordsList.length);
    return this.secretWordsList[randomIndex].normalized.toUpperCase();
  }

  isValidWord(guess) {
    return this.validWordsSet.has(guess);
  }

  // Algoritmo clássico do Termo para gerenciar letras duplicadas
  evaluateGuess(guess, secret) {
    const result = Array(this.wordLength).fill('absent');
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    // 1ª passada: Verificar letras corretas (Verdes)
    for (let i = 0; i < this.wordLength; i++) {
      if (guessArr[i] === secretArr[i]) {
        result[i] = 'correct';
        secretArr[i] = null;
        guessArr[i] = null;
      }
    }

    // 2ª passada: Verificar letras existentes mas em outra posição (Amarelas)
    for (let i = 0; i < this.wordLength; i++) {
      if (guessArr[i] !== null) {
        const foundIndex = secretArr.indexOf(guessArr[i]);
        if (foundIndex !== -1) {
          result[i] = 'present';
          secretArr[foundIndex] = null;
        }
      }
    }

    return result;
  }
}

