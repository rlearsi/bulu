# Guia do Desenvolvedor — Termo Duelo (Multiplayer P2P)

Este guia documenta a arquitetura do projeto e mostra exatamente **quais arquivos e linhas alterar** para customizar regras, tempos, limites de jogadores, banco de palavras e interface.

---

## 1. Visão Geral da Arquitetura

O projeto utiliza **JavaScript ES Modules puro** (sem dependências de runtime além do PeerJS e canvas-confetti carregados no `index.html`) e CSS modularizado:

| Arquivo | Responsabilidade |
| :--- | :--- |
| `index.html` | Estrutura DOM do lobby, placar, tabuleiro, teclado, chat e modais |
| `script.js` | Orquestrador principal (`TermoMultiplayerGame`): estado da partida, fila de turnos e eventos P2P |
| `words.js` | Banco de palavras válidas (`validGuesses`) e lista de palavras sorteadas (`secretWords`) |
| `js/network.js` | Camada WebRTC/PeerJS (`P2PNetwork`): topologia em estrela (host hub), salas públicas/privadas e reconexão |
| `js/timer.js` | Cronômetro regressivo de turno (`TurnTimer`) |
| `js/board-ui.js` | Renderização e animações do tabuleiro, teclado e placar (2 jogadores e 3–4 jogadores) |
| `js/multi-board.js` | Layout multigrade (`MultiBoardLayout`) dos modos Cruzado e Individual: grade própria + miniaturas dos oponentes (2 lado a lado, 3 com oponentes empilhados à direita, 4 em 2×2) |
| `js/game-rules.js` | Validação de palavras, normalização de acentos e cálculo de cores (`correct`, `present`, `absent`) |
| `js/chat.js` | Chat em overlay com suporte a texto e mensagens de voz (WebM/Opus em Base64) |
| `js/voice.js` | Chat de voz em tempo real (`VoiceManager`): solicitação mútua com banner toast, transmissão de áudio bidirecional via WebRTC (`peer.call()`), mute/unmute e dot de notificação |
| `js/profile.js` | Gerenciamento de nome e avatar (compressão em canvas e persistência no `localStorage`) |
| `js/audio.js` | Efeitos sonoros sintetizados via Web Audio API |
| `css/*.css` | Estilos separados por componente (`lobby.css`, `scoreboard.css`, `board.css`, `multiboard.css`, `keyboard.css`, `chat.css`, `modals.css`) |

---

## 2. Receitas de Manutenção (Onde Alterar Cada Mecânica)

### 2.1. Alterar o Tempo por Jogada e Alertas de Tensão

A duração do turno pode ser configurada pelo host no lobby da sala entre **1 minuto (60s), 2 minutos (120s) ou 3 minutos (180s)** (`this.turnDuration` em `script.js` e `this.timer.setDuration()`):

1. **`script.js`** (no construtor e opções de configuração):
   ```js
   this.turnDuration = 60; // 60s, 120s ou 180s
   this.timer = new TurnTimer(this.ui.turnTimerElement, this.turnDuration, this.audio);
   ```
2. **`js/timer.js` e Tique-taque com Efeito de Tensão:**
   - Nos últimos 15 segundos (`this.timeLeft <= 15`), o texto do relógio fica vermelho (`.warning`) e é disparado o som de tique-taque acelerado (`this.audio.playTensionTickSound()`).
   - Em 3 ou 4 jogadores, a barra horizontal de progresso do badge (`.multi-badge-bar`) recebe a classe `.warning`.

---

### 2.1.1. Controle de Comunicação e Reações Rápidas (Emojis Voadores)

1. **Comunicação da Sala (`this.roomComms`):**
   - `'both'`: Chat de texto e chamada de voz via WebRTC liberados.
   - `'text'`: Apenas chat de texto disponível; botão de voz oculto.
   - `'voice'`: Apenas voz liberada; botão de chat oculto.
   - `'none'`: Modo silencioso / foco absoluto (chat e voz desativados).
2. **Reações Rápidas e Provocações (`#btn-reactions` / `#reactions-bar`):**
   - Durante a partida, jogadores podem enviar reações rápidas (👏, 🔥, 🤔, 😱, 💀, 🎯).
   - O emoji flutua na tela (`.floating-emoji`) e transmite o pacote P2P `REACTION` com som personalizado (`playReactionSound`).

---

### 2.2. Alterar o Limite de Jogadores na Sala

O jogo suporta salas de **2 a 4 jogadores** na interface atual (topologia em estrela onde o Host retransmite os pacotes). Para alterar o limite máximo ou o valor padrão ao abrir o lobby:

1. **`script.js`**:
   - No construtor:
     ```js
     this.maxPlayers = 2; // Valor inicial selecionado ao abrir o lobby
     ```
   - No método `setMaxPlayers(value)`:
     ```js
     // Altere o limite superior (4) caso adicione mais opções
     const v = Math.max(2, Math.min(4, Number(value) || 2));
     ```
2. **`index.html`**:
   - Adicione ou remova botões `.max-players-option` dentro de `#max-players-popover`:
     ```html
     <button type="button" class="max-players-option" data-value="5" role="menuitemradio">5</button>
     ```
3. **`js/board-ui.js` e `css/scoreboard.css`**:
   - Em `renderScoreboard()`, partidas com `players.length === 2` usam `.match-scoreboard` (placar clássico `0 × 0`) e partidas com `players.length > 2` usam `#multi-scoreboard` (badges finos com barra de progresso interna).
   - Em `renderMultiScoreboard()`, a classe `.grid-2x2` organiza 4 jogadores em 2 colunas (`grid-template-columns: repeat(2, minmax(0, 1fr))`).

---

### 2.3. Configurações de Sala (Host) e Tela de Criação de Sala (`#room-setup-view`)

Na tela inicial do Lobby (`#lobby-home-view`), ao lado do botão verde **"Criar Sala"** (`#btn-create-room`), o botão de engrenagem moderno (`#btn-room-config-toggle`) abre a tela dedicada de configurações e criação da sala (`#room-setup-view`) na mesma página inicial (ocultando `#lobby-home-view` e exibindo apenas os itens da sala):
- **Padrão inicial (criação direta pelo botão verde "Criar Sala"):** Sala privada (com código), 2 jogadores, modo Normal, seleção do oponente ativada.
- **Formulário de Configurações (`#room-config-panel`):**
  1. Seção 1 (Modo e Jogadores): 2 botões dropdown alinhados horizontalmente:
     - Quantidade de jogadores (`#btn-cfg-players-dropdown`: 2, 3 ou 4 com popover rápido e ícone compacto).
     - Modo de jogo (`#btn-cfg-mode-dropdown`: Normal, Cruzado e Individual com ícones originais e rótulo de texto).
  2. Seção 2 (Privacidade em jogo): 2 botões dropdown alinhados horizontalmente:
     - Seleção do oponente (`#btn-cfg-cursor-dropdown`: "Permitir Seleção" ou "Ocultar Seleção" com ícone de olho).
     - Grades dos oponentes (`#btn-cfg-reveal-dropdown`: por padrão mostra letras em todos os modos; no modo Normal exibe "Mostrar tudo" e fica inativo pois a grade é única compartilhada; ao escolher Cruzado ou Individual, a opção fica ativa para alternar entre "Com Letras" e "Apenas Cores").
  3. Seção 3 (Acesso da sala): 2 botões de alternância horizontal:
     - Sala Privada (com ícone de cadeado) vs. Pública (com ícone de globo).
  - Padrão visual de seleção: amarelo translúcido (`rgba(211, 173, 105, 0.2)` com borda dourada suave), mantendo consistência e sem sobrecarregar a interface.
- **Lista de Jogadores e Ações do Host:**
  - Jogadores que entram na sala são listados abaixo em `#lobby-room-players-list`. O host pode expulsar qualquer convidado pelo botão **"Expulsar"** (`KICK_PLAYER`).
  - O botão **"Iniciar partida"** (`#btn-start-match`) fica amarelado enquanto houver menos que o total configurado de jogadores e fica verde (`.ready`) ao atingir a meta de jogadores.
  - Ao clicar em **"Iniciar partida"**, inicia-se uma contagem regressiva de 3 segundos (`START_COUNTDOWN`) antes de abrir o tabuleiro.
  - Ao lado direito de "Iniciar partida", o botão **"Cancelar"** (`#btn-cancel-room`) cancela a criação da sala, limpa a lista e retorna à visão principal do lobby.
  - Na lista de salas públicas disponíveis (`#public-rooms-modal`), cada sala exibe a informação do modo de jogo (`Modo Normal`, `Modo Cruzado`, `Modo Individual`).

---

### 2.4. Alterar a Ordem da Fila de Turnos e Quem Começa a Próxima Rodada

A fila de jogadores segue a ordem do array `this.players` em `script.js` (`this.players[0]` é sempre o Host atual):

- **Passar a vez para o próximo da fila:** método `nextPlayerId(afterId)` em `script.js`:
  ```js
  nextPlayerId(afterId) {
    if (this.players.length === 0) return '';
    const idx = this.players.findIndex(p => p.id === afterId);
    if (idx === -1) return this.players[0].id;
    return this.players[(idx + 1) % this.players.length].id;
  }
  ```
- **Definir quem inicia a rodada:** métodos `getFirstRoundStarter()` e `getNextRoundStarter()` em `script.js`:
  - **Primeira rodada (`this.firstRoundStarter`):**
    - `'host'`: o criador da sala sempre começa a primeira rodada.
    - `'random'`: sorteia aleatoriamente qualquer um dos jogadores presentes na sala (`getFirstRoundStarter()`).
  - **Rodadas seguintes (`this.nextRoundStarterRule`):**
    - `'winner'`: quem ganhou a rodada anterior começa a próxima partida (`this.lastWinnerId`). Se houve empate (ninguém acertou), o próximo jogador da fila começa (`this.nextPlayerId(this.roundStarterId || this.hostId)`).
    - `'next_player'`: quem ganhou define a ordem, passando a vez para o próximo jogador da fila começar a próxima rodada (`this.nextPlayerId(this.lastWinnerId)`).
    - `'host'`: o host sempre começa todas as rodadas seguintes, independentemente de quem venceu a rodada anterior.
  - Essas opções são configuradas pelo host no lobby da sala dentro da seção **"Quem começa?"** usando 2 dropdowns com ícones correspondentes.

---

### 2.5. Migração de Host e Tempo de Tolerância

Se o Host desconectar durante a partida (`handleHostLost(hostId)` em `script.js`):

1. O **segundo da fila** (`remaining[0].id`) assume automaticamente o papel de Host (`this.network.becomeHost()`).
2. Os demais convidados executam `this.network.reconnectToHost(newHostId)` e enviam o pacote `REJOIN`.
3. O timeout de reconexão é de **8000 ms (8 segundos)** tanto em `script.js` (`this.hostMigrationTimer`) quanto em `js/network.js` (`reconnectToHost`). Para ajustar a tolerância em redes móveis lentas, altere esse valor nos dois pontos.

---

### 2.6. Alterar Número de Tentativas ou Tamanho da Palavra

1. **`script.js`** (no construtor e em `getRowsForMode()`):
   ```js
   this.maxRows = 6;    // Linhas iniciais; na partida é recalculado por getRowsForMode() (6 + jogadores extras)
   this.wordLength = 5; // Quantidade de letras por palavra (colunas)
   ```
2. **`css/board.css`**:
   - Ajuste o grid das linhas (`.row`) caso mude `wordLength` de 5 para outro valor.
3. **`words.js`**:
   - Certifique-se de que as palavras em `wordsData` possuam o mesmo comprimento definido em `this.wordLength`.

---

### 2.7. Adicionar ou Remover Palavras do Banco (`words.js`)

Abra `words.js`:
- **Palavras sorteadas como segredo (`secretWords`):** Contém apenas palavras base comuns do português (~1.788 substantivos no singular, adjetivos, verbos no infinitivo, advérbios e numerais, sem plurais terminados em `S` e sem conjugações verbais obscuras), seguindo o padrão do Termo original.
- **Palavras válidas para tentativa (`validGuesses` / `wordsData`):** Contém todas as `secretWords` somadas a plurais e conjugações verbais válidas (~5.482 palavras de 5 letras) aceitas nos palpites dos jogadores.
- As palavras podem conter acentos ou `ç` no campo `word`; o campo `normalized` mantém apenas letras de `A-Z` sem acento para validação e comparação em `js/game-rules.js`.

---

### 2.8. Alterar o Número de Vagas de Salas Públicas

Em `js/network.js`:
```js
const PUBLIC_SLOT_PREFIX = 'termo-duelo-public-';
const MAX_PUBLIC_SLOTS = 10; // Quantidade de canais públicos verificados pelo scanner
```
Aumentar `MAX_PUBLIC_SLOTS` permite mais salas públicas simultâneas, mas aumenta o número de conexões de sondagem feitas em `scanPublicRooms()`.

---

### 2.9. Modos de Jogo (Normal, Cruzado e Individual)

O host escolhe o modo no botão ao lado do seletor de jogadores no lobby (`#btn-game-mode`, estado `this.gameMode` em `script.js`). O modo, `revealLetters` e as palavras (`secrets`) viajam no pacote `START_MATCH`. O treino solo é sempre Normal (`get mode()`).

| Modo | Mecânica |
| :--- | :--- |
| `normal` | Uma grade compartilhada, jogada em turnos. Linhas: solo = 6, 2 jogadores = 7, 3 = 8, 4 = 9 (`getRowsForMode()`). |
| `cross` (Cruzado) | Cada jogador tem sua grade e palavra secreta (`this.secrets[playerId]`). Só joga quem está na vez e **cada palpite preenche todas as grades**, avaliado contra a palavra de cada dono. Vence quem acertar a **própria** palavra; se o palpite acertar a palavra de **outro** jogador, a partida termina **sem vencedor** (`triggerNoWinner`, botão "Continuar Jogando"). Linhas: 2 jogadores = 7, 3 = 8, 4 = 9 (`getRowsForMode()`). Grades de quem não está na vez ficam esmaecidas (`.mm-slot.inactive`, `MultiBoardLayout.setActive`). A opção `revealLetters` oculta apenas as letras nas miniaturas dos oponentes (`mirrorRow` / `revealRow`), mantendo a grade do próprio jogador sempre com as letras visíveis. |
| `individual` | Cada jogador tem sua grade e palavra, **sem turnos** (6 linhas) e sem cronômetro. Vence quem acertar primeiro; o host decide o vencedor pela ordem de chegada dos palpites e envia `MM_RESULT` (`decideIndividualWinner`). Se todos esgotarem as tentativas, termina sem vencedor. Opção do host `revealLetters`: `false` = grades dos oponentes só com cores, `true` = com letras. |

- Layout: `MultiBoardLayout.mount()` move o próprio `#board` para a primeira posição do `#mm-layout` e cria miniaturas para os oponentes; o estilo está em `css/multiboard.css` (classes `.n2`, `.n3`, `.n4`). As grades usam `container-type: size` em `.mm-area` e a variável `--bw` (`min(100cqw, (100cqh - 18px) * 5 / --rows)`) para manter os tiles sempre quadrados e centralizados, com o rótulo do jogador logo acima.
- O placar (`renderScoreboard`) continua seguindo a quantidade de jogadores em qualquer modo; no Individual é chamado com `turnless: true` (sem destaque de vez/barra de tempo).
- Para alterar o número de linhas do Cruzado, edite `getRowsForMode()` em `script.js`.
- As palavras de todos os jogadores são enviadas a todos em `START_MATCH` (cada cliente avalia localmente); um jogador técnico poderia inspecioná-las no navegador.

---

### 2.10. Modos Solo (Clássico e Infinito)

Na parte inferior do Lobby, ao lado do botão `#btn-practice` (`Modo Solo`), o botão seletor `#btn-solo-mode` exibe o rótulo do modo atual (`Clássico` ou `Infinito`) junto ao seu ícone e permite alternar `this.soloMode` entre:
- **Clássico (`classic`):** Descubra 1 palavra secreta em até 6 tentativas.
- **Infinito (`infinite`):** Acerte palavras em sequência sem parar (`advanceInfiniteWord(previousWord)` em `script.js`). A cada acerto, `this.infiniteStreak` aumenta (recorde persistido em `localStorage` na chave `termo_infinite_best`), o tabuleiro e o teclado são limpos, uma nova palavra secreta é sorteada e a palavra anterior sobe automaticamente para a linha `0` já avaliada contra o novo segredo, posicionando o cursor na linha `1`. O jogo continua até esgotar as 6 linhas sem acertar.

---

### 2.11. Histórico de Palavras Acertadas (`#words-history-modal`)

Na barra de ações no topo (`#game-actions-bar`), o botão `#btn-words-history` abre o modal `#words-history-modal` listando todas as palavras acertadas em todas as partidas (com qualquer oponente na rede ou no modo solo):
- **Layout e divisor por partida:** Cada item exibe em 2 colunas a palavra acertada com o mesmo estilo de mini-grade do tabuleiro (`.words-history-grid` com 5 `.tile.correct`) à esquerda e o nome de quem acertou (`Você` ou o nome do oponente) à direita, dentro de uma lista com rolagem (`.words-history-list`). Sempre que uma nova partida/sala é iniciada (`startNewMatchHistoryGroup()` em `script.js`), um novo `matchId` é gerado e a lista insere um divisor (`.words-history-divider`) separando verticalmente os grupos de partidas.
- **Persistência local acumulativa:** Todo o histórico permanece salvo em `localStorage` na chave `termo_match_guessed_words` (`recordGuessedWord`, `loadGuessedWordsHistory`, `saveGuessedWordsHistory` em `script.js`).

---

### 2.12. Reações Rápidas e Emojis Integrados ao Teclado

Durante a partida em modos multiplayer com reações ativas (`allowReactions: true`):
- **Na vez do jogador:** O teclado virtual opera normalmente com letras, avaliações coloridas (`correct`, `present`, `absent`) e ações de `ENTER` / `BACKSPACE`.
- **Na vez do oponente:** As letras são removidas das teclas e os emojis principais e mais expressivos são posicionados em um bloco central perfeitamente simétrico de 4x3 (Linha 1: `R`, `T`, `Y`, `U`; Linha 2: `F`, `G`, `H`, `J`; Linha 3: `C`, `V`, `B`, `N` com emojis 👏, 🔥, 🤔, 🎯, 😱, 💀, ❤️, 👀, 😂, 🤫, ⚡, 🎉). O jogador pode clicar diretamente nas teclas do centro para disparar reações flutuantes e efeitos sonoros sincronizados via WebRTC (`REACTION`).
- Teclas fora da área de reações permanecem esmaecidas e inativas (`.reaction-empty`).
- Quando a vez retorna ao jogador, as letras e as cores já avaliadas são restauradas imediatamente.

---

## 3. Protocolo de Mensagens WebRTC (`handleP2PMessage`)

Todas as mensagens trafegam pelo `P2PNetwork`. Quando um convidado envia um pacote ao Host, o Host adiciona `from: peerId` e retransmite (`broadcast`) para os demais convidados:

| Tipo (`data.type`) | Emissor | Descrição |
| :--- | :--- | :--- |
| `QUERY_ROOM_INFO` / `PUBLIC_ROOM_INFO` | Scanner / Host | Descoberta de salas públicas abertas, lotação (`count`/`max`) e modo (`mode`) |
| `JOIN_GAME` | Convidado | Solicita entrada na sala enviando `name` e `avatar` |
| `REJOIN` | Convidado | Reconecta ao novo Host após migração |
| `LOBBY_UPDATE` | Host | Atualiza a lista de jogadores que aguardam na sala antes de começar |
| `KICK_PLAYER` | Host | Expulsa um convidado específico (`targetId`) da sala de espera |
| `START_COUNTDOWN` | Host | Notifica contagem regressiva de 3 segundos antes do início da partida |
| `PLAYERS_SYNC` | Host | Sincroniza a lista de jogadores e placares após reconexão |
| `START_MATCH` | Host | Inicia a partida enviando `players`, `secretWord`, `startingId`, `gameMode`, `revealLetters`, `showOpponentSelection`, `turnDuration`, `roomComms`, `allowReactions` e `secrets` (palavra de cada jogador nos modos Cruzado/Individual) |
| `LIVE_KEYSTROKE` | Jogador da vez | Espelha letras digitadas/apagadas em tempo real (`ADD` / `DELETE`); não é enviado no modo Individual |
| `CURSOR_MOVE` | Jogador ativo | Informa a posição selecionada (`row`, `col`) quando `showOpponentSelection` está habilitado |
| `SUBMIT_GUESS` | Jogador da vez | Submete a tentativa avaliada, informa se venceu (`isWin`) e passa a vez (`nextTurnId`). No Cruzado cada cliente reavalia o palpite contra a palavra de cada grade; no Individual qualquer jogador envia a qualquer momento (sem `nextTurnId`) |
| `MM_RESULT` | Host | Modo Individual: informa o `winnerId` (ou `null` se ninguém acertou) |
| `RESTART_REQUEST` | Convidado | Modos Cruzado/Individual: pede ao host para reiniciar a partida |
| `TIME_EXPIRED` | Jogador da vez | Informa que o tempo de 1 minuto acabou e passa a vez (`nextTurnId`) |
| `PLAYER_LEFT` | Host | Notifica que um participante desconectou da sala |
| `UPDATE_PROFILE` | Qualquer jogador | Atualiza nome/avatar em tempo real no placar |
| `RESTART_MATCH` | Qualquer jogador | Sorteia nova palavra e reinicia o tabuleiro mantendo o placar |
| `PLAY_AGAIN_REQUEST` | Qualquer jogador | Marca o jogador como pronto ao final da partida ("Esperando oponente"); quando todos confirmam, o Host inicia a nova rodada |
| `CHAT_MESSAGE` | Qualquer jogador | Mensagem de texto ou áudio (`audioData` em Base64) |
| `VOICE_REQUEST` | Qualquer jogador | Solicita início de chamada de voz em tempo real |
| `VOICE_ACCEPT` | Convidado / Host | Aceita a solicitação e conecta a transmissão de voz via WebRTC |
| `VOICE_REJECT` | Convidado / Host | Recusa a chamada de voz (mantém o dot de notificação no botão de quem recusou) |
| `VOICE_CANCEL` | Solicitante | Cancela a solicitação de voz antes do oponente responder |
| `VOICE_END` | Qualquer jogador | Encerra a transmissão de voz ativa |
| `REACTION` | Qualquer jogador | Dispara emoji voador na tela dos jogadores com efeito sonoro |

---

## 4. Cache Busting e Build Android (Vite + Capacitor)

- **Cache Busting (`?v=X.Y.Z`):** Sempre que editar `style.css`, `script.js` ou `words.js`, mantenha a query string `?v=X.Y.Z` em `index.html` e nos `import` do `script.js` sincronizada com a versão do arquivo `VERSION`.
- **Atenção ao `style.css`:** Nunca coloque `?v=...` nos `@import './css/...'` dentro de `style.css`, pois o Vite precisa concatená-los sem query string ao gerar o pacote de produção (`npm run build`).
- **Build e Sincronização Android:**
  ```bash
  npm run build
  npx cap sync android
  ```

