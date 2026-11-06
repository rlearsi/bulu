# Diretrizes e Regras do Projeto (AGENTS.md)

## Regra de Consulta Obrigatória às Regras do Projeto (.agents/rules)

- **LEITURA OBRIGATÓRIA DE TODOS OS ARQUIVOS EM `.agents/rules/`:**
  - O agente deve **obrigatoriamente ler, respeitar e aplicar** todas as diretrizes e regras contidas nos arquivos da pasta [`.agents/rules/`](file:///opt/lampp/htdocs/bulu/.agents/rules) antes de concluir ou estruturar suas respostas.
  - Qualquer regra adicionada em `.agents/rules/*.md` possui prioridade máxima na execução de tarefas e formato de resposta neste projeto.

---

## Regras Ativas Mapeadas

- **Sugestão de Mensagem de Commit ([`.agents/rules/commit_suggestion.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/commit_suggestion.md)):**
  - **Proibição Total de Commits Automáticos:** O assistente nunca deve executar `git commit` sem solicitação expressa do usuário.
  - **Verificação de `git status`:** Antes de finalizar respostas com alterações pendentes, inspecionar `git status -s` e exibir a sugestão formatada em bloco `text` em inglês (Conventional Commits) no final da resposta. Se o git estiver limpo, não exibir sugestão.

- **Padrão Visual Clean e Moderno ([`.agents/rules/ui_design_system.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/ui_design_system.md)):**
  - **Evitar backgrounds agressivos:** Empregar tons e transparências suaves integradas ao fundo principal (`rgba(255, 255, 255, 0.04-0.06)`).
  - **Sem estilo quote:** Não utilizar barras laterais de citação (`border-left` chamativo).
  - **Sem linhas e bordas excessivas:** Eliminar bordas tracejadas ou divisórias pesadas, priorizando acabamento minimalista.
  - **Ícones sempre à esquerda:** Em todos os botões e seletores da interface com ícone e texto, o ícone deve vir posicionado à esquerda do texto (`[Ícone] [Texto]`).
  - **Animações em botões:** Rotações em hover devem ser aplicadas estritamente no elemento `svg` interno e nunca na caixa do botão.

- **Cache Busting e Versionamento de Assets ([`.agents/rules/cache_busting.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/cache_busting.md)):**
  - **Proibição de alterar `VERSION`:** O arquivo `VERSION` é somente leitura; o agente **NUNCA** deve editá-lo ou incrementá-lo sem pedido expresso do usuário.
  - **Sincronização de `?v=X.Y.Z`:** Manter a query string de versão em `index.html` (`style.css?v=X.Y.Z` e `script.js?v=X.Y.Z`) e em `script.js` (`./words.js?v=X.Y.Z`) alinhada ao valor lido em `VERSION`.

- **Manutenção Contínua do Guia do Desenvolvedor ([`.agents/rules/dev_guide_maintenance.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/dev_guide_maintenance.md)):**
  - **Preservação e atualização de [`DEV_GUIDE.md`](file:///opt/lampp/htdocs/bulu/DEV_GUIDE.md):** Nunca remover o arquivo `DEV_GUIDE.md` e sempre atualizá-lo automaticamente quando houver mudanças em mecânicas, tempos, limites de sala, protocolo WebRTC ou arquitetura de arquivos.

- **Regra de Idioma e Dicionário ([`.agents/rules/language_dictionary.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/language_dictionary.md)):**
  - **Qualidade Vocabular, Siglas e Arcaísmos:** Foco rigoroso no português brasileiro natural. Proibição absoluta de palavras em inglês (`ICE`, `BOY`, `DATE`), siglas/acrônimos (`BMG`, `BLI`, `BPI`, `ACD`, `ACP`, `ACL`, etc.) e palavras arcaicas ou em desuso (`MOR`, `MUI`, `OIS`, etc.) nas listas de palavras secretas e palpites. Toda palavra deve ser um vocábulo por extenso da língua portuguesa.

- **Prevenção de Loops e Execução Eficiente ([`.agents/rules/tool_execution.md`](file:///opt/lampp/htdocs/bulu/.agents/rules/tool_execution.md)):**
  - **Proibição de Comandos Repetitivos (Anti-Loop):** Não reexecutar buscas idênticas mais de 2 vezes consecutivas.
  - **Ação Rápida e Decisiva:** Ao localizar o trecho a ser alterado, partir imediatamente para a edição (`edit_file`) sem consultas redundantes que consomem cota.



