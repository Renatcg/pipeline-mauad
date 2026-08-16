# Política de manutenção — Pipeline Mauad v1

## Linha de corte

- Data: 16/08/2026
- Versão estável: `mauad-v1-stable`
- Produto: Pipeline Comercial Mauad
- Situação: operação preservada e evolução funcional encerrada

Esta versão representa a referência estável do sistema utilizado pela Mauad antes do início da nova plataforma SaaS.

## Alterações permitidas

- correções de indisponibilidade;
- correções de perda ou inconsistência de dados;
- correções de segurança;
- adequações obrigatórias de integrações existentes;
- manutenção necessária para continuidade da operação;
- correções de bugs que prejudiquem fluxos já existentes.

## Alterações fora desta linha

- novas funcionalidades;
- novos módulos;
- mudanças estruturais destinadas ao SaaS;
- customizações para novos clientes;
- alterações de arquitetura multiempresa;
- experimentos de produto.

Essas alterações deverão ser implementadas no repositório da nova plataforma SaaS.

## Regra de propagação

Toda correção aplicada neste produto deve informar se também se aplica ao SaaS. Correções relevantes de segurança, integridade ou regra de negócio deverão ser reproduzidas ou reavaliadas na nova plataforma.

## Dados e credenciais

A criação da plataforma SaaS não autoriza a cópia de dados pessoais, arquivos, backups, tokens ou credenciais deste projeto. Desenvolvimento deverá usar dados sintéticos. Homologação poderá usar somente uma base anonimizada e validada.
