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

