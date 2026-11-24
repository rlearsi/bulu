/**
 * authority-local.js - Módulo Exclusivo do Computador Confiável (Localhost / ADM)
 *
 * IMPORTANTE: Este arquivo está no .gitignore e NUNCA vai para o GitHub.
 * Apenas o computador central com este arquivo:
 *  1. Define a carteira principal persistente como autoridade máxima de emissão de moeda;
 *  2. Garante que abas anônimas ou outros navegadores se comportem como clientes/jogadores comuns
 *     em vez de gerarem blocos paralelos isolados.
 *  3. Carimba os blocos de emissão (1 moeda a cada 10 min) e transferências com chave ECDSA.
 */

(function initLocalAuthorityModule() {
  window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Se a URL tiver ?client=1, ?node=player, ?player=1 ou ?noauth=1,
    // esta aba é FORÇADA a atuar como Nó Jogador comum (útil para testes em abas anônimas/locais)
    const forcePlayerMode = urlParams.has('client') || urlParams.has('player') || urlParams.has('noauth') || urlParams.get('node') === 'player';

    // Endereço fixo gravado para a Autoridade Confiável deste computador
    const AUTHORITY_STORAGE_KEY = 'bitcrack_master_authority_address';

    const checkModuleReady = setInterval(() => {
      if (window.HumanProof && window.termoGame && window.termoGame.bitcrack) {
        clearInterval(checkModuleReady);
        const bitcrack = window.termoGame.bitcrack;
        const myWallet = bitcrack.myWalletAddress;

        if (myWallet) {
          let masterAuth = localStorage.getItem(AUTHORITY_STORAGE_KEY);
          
          if (!masterAuth && !forcePlayerMode) {
            masterAuth = myWallet;
            try {
              localStorage.setItem(AUTHORITY_STORAGE_KEY, masterAuth);
            } catch (e) {}
          }

          if (forcePlayerMode) {
            // Força a autoridade a ser diferente do próprio endereço deste nó, garantindo status de 'Nó Jogador'
            const remoteMaster = masterAuth || 'bitcrack-authority-master';
            window.HumanProof.setTrustedAuthorityAddress(remoteMaster);
            bitcrack.isAuthority = false;
            bitcrack.checkAuthorityStatus();
            bitcrack.updateAuthorityUI();
            bitcrack.updateBalanceUI();
            console.log(`🎮 [Localhost Jogador] Modo jogador ATIVO via URL (?noauth=1 / ?player=1). Carteira: ${myWallet}`);
            return;
          }

          // Janela Normal:
          window.HumanProof.setTrustedAuthorityAddress(masterAuth);
          bitcrack.checkAuthorityStatus();
          bitcrack.updateAuthorityUI();
          bitcrack.updateBalanceUI();

          const isDaemonProcess = urlParams.has('daemon');

          if (!isDaemonProcess && bitcrack.isAuthority) {
            // Esta é uma aba visível da Autoridade no navegador.
            // Pulsa um sinal de presença ("heartbeat") ativo a cada 1.5s.
            const UI_HEARTBEAT_KEY = 'bitcrack_authority_ui_active_ts';
            const sendHeartbeat = () => {
              try {
                localStorage.setItem(UI_HEARTBEAT_KEY, String(Date.now()));
              } catch (e) {}
            };
            sendHeartbeat();
            const uiTimer = setInterval(sendHeartbeat, 1500);

            // Ao fechar a aba, remove o sinal imediatamente
            window.addEventListener('beforeunload', () => {
              clearInterval(uiTimer);
              try {
                localStorage.removeItem(UI_HEARTBEAT_KEY);
                // Notifica abas/daemon locais
                if (bitcrack.localChannel) {
                  bitcrack.localChannel.postMessage({ type: 'AUTHORITY_UI_CLOSED', ts: Date.now() });
                }
              } catch (e) {}
            });

            console.log(`👑 [Localhost Authority] Aba Visível ATIVA (${masterAuth}). Daemon em segundo plano entra em standby.`);
          } else if (isDaemonProcess) {
            // Processo Headless em background (daemon):
            // Monitora se o usuário abriu uma aba normal.
            const UI_HEARTBEAT_KEY = 'bitcrack_authority_ui_active_ts';
            console.log(`🤖 [Localhost Authority] Daemon Headless iniciado. Monitorando alternância dinâmica com a aba.`);

            setInterval(() => {
              const lastUiTs = Number(localStorage.getItem(UI_HEARTBEAT_KEY) || 0);
              const isUiAlive = (Date.now() - lastUiTs) < 4000;

              if (isUiAlive && bitcrack.isAuthorityActiveNode !== false) {
                // Aba aberta detectada: daemon cede a rede P2P e o carimbo de autoridade para a aba
                bitcrack.isAuthorityActiveNode = false;
                console.log('💤 [Daemon Headless] Aba visível detectada. Daemon em STANDBY para evitar conflito de nós.');
              } else if (!isUiAlive && bitcrack.isAuthorityActiveNode === false) {
                // Aba fechada: daemon reassume o controle da autoridade imediatamente
                bitcrack.isAuthorityActiveNode = true;
                bitcrack.reloadChainFromDB();
                bitcrack.discoverMeshPeers();
                console.log('⚡ [Daemon Headless] Aba visível fechada. Daemon REASSUMIU o controle da Autoridade Confiável.');
              }
            }, 2000);
          } else {
            console.log(`🎮 [Localhost Jogador] Aba operando como Jogador. Reconhecendo autoridade mestre: ${masterAuth}`);
          }
        }
      }
    }, 200);
  });
})();

