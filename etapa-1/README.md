# Projeto Final da Fase 2: Etapa 1  
## Urna Eletrônica Didática com a BitDogLab

**Instituição:** Instituto Hardware BR  
**Autores:** Ryan Micael e João Pedro Lacerda  
**Data:** 17 de Julho de 2025  

---

## Sumário

1. [Introdução e Justificativa](#introdução-e-justificativa)  
2. [Requisitos da Solução](#requisitos-da-solução)  
   - [Requisitos Funcionais (RF)](#requisitos-funcionais-rf)  
   - [Requisitos Não Funcionais (RNF)](#requisitos-não-funcionais-rnf)  
3. [Lista Inicial de Materiais](#lista-inicial-de-materiais)  

---

## Introdução e Justificativa

A tomada de decisão em grupos, seja em ambientes educacionais, corporativos ou comunitários, frequentemente enfrenta três desafios:

- Baixa participação  
- Falta de privacidade  
- Processos de apuração lentos e suscetíveis a erros  

Enquetes online são impessoais e facilmente ignoradas, enquanto votações manuais não oferecem sigilo, podendo levar à pressão social e influenciar o resultado.

### Problema a Ser Resolvido

Este projeto visa sanar a necessidade de um sistema de votação de baixo custo, engajante e com boa confiabilidade para grupos de pequeno e médio porte. A solução proposta simula a eficiência e sigilo do sistema eleitoral brasileiro, com o objetivo de tornar esse tipo de processo democrático mais acessível, transparente e educativo para diversas aplicações.

---

## Requisitos da Solução

### Requisitos Funcionais (RF)

- **RF-1:** A urna deve permanecer em estado de espera até ser habilitada para uma nova votação.  
- **RF-2:** A urna deve possuir uma interface para o eleitor digitar números (via teclado matricial).  
- **RF-3:** A urna deve possuir botões físicos para as ações "Branco", "Corrige" e "Confirma".  
- **RF-4:** Ao digitar um número de candidato válido, a urna deve exibir no display OLED as informações do candidato (nome e imagem).  
- **RF-5:** Ao pressionar "Confirma", a urna deve registrar o voto, emitir um feedback sonoro característico e um feedback visual de conclusão.  
- **RF-6:** Após a confirmação, a urna deve se travar e aguardar uma nova habilitação.  
- **RF-7:** A urna deve ser capaz de salvar uma cópia de segurança (log) dos votos em um Cartão SD.  
- **RF-8:** Um aplicativo de celular (Módulo Mesário) deve permitir a criação de uma nova eleição e o cadastro de candidatos.  
- **RF-9:** O aplicativo deve ser capaz de habilitar a urna para o próximo eleitor.  
- **RF-10:** O aplicativo deve receber e armazenar de forma segura os votos vindos da urna.  
- **RF-11:** O aplicativo deve possuir uma função para encerrar a votação e apurar os resultados.  

### Requisitos Não Funcionais (RNF)

- **RNF-1 (Usabilidade):** A interface da urna deve ser intuitiva e clara, replicando a simplicidade da urna brasileira real.  
- **RNF-2 (Confiabilidade):** O sistema deve ser robusto. Falhas de conexão não devem resultar na perda de votos já computados.  
- **RNF-3 (Segurança):** A comunicação entre a urna e o aplicativo deve utilizar criptografia. O sistema deve impedir votos duplicados.  
- **RNF-4 (Desempenho):** A resposta da urna aos comandos do eleitor deve ser instantânea, sem atrasos perceptíveis.  
- **RNF-5 (Portabilidade):** A urna deve ser um dispositivo portátil, com alimentação própria ou de fácil conexão.  
- **RNF-6 (Autenticidade):** O design físico, sons e fluxo de votação devem ser o mais fiel possível à experiência da urna brasileira para maximizar o engajamento e o valor didático.  

---

## Lista Inicial de Materiais

| Quantidade | Componente                  | Função no Projeto                                                                 |
|------------|-----------------------------|------------------------------------------------------------------------------------|
| **Controle e Processamento**            |||
| 1          | Placa BitDogLab             | Unidade central de controle, processamento e interface primária.                  |
| **Interface do Eleitor**               |||
| 1          | Teclado Matricial 4x4       | Interface tátil para digitação dos números de candidatos e comandos.              |
| 1          | Display OLED                | Exibição de status, informações do candidato e resultados.                        |
| 1          | Buzzer Ativo                | Feedback sonoro característico para a confirmação do voto.                        |
| **Armazenamento e Segurança**         |||
| 1          | Módulo para Cartão SD (SPI) | Para backup físico e seguro dos votos, garantindo auditoria e confiabilidade.     |
| 1          | Cartão MicroSD              | Mídia de armazenamento para o log de votos. (8GB é suficiente).                   |
| **Estrutura e Montagem**              |||
| ~500g      | Filamento PETG              | Material para impressão 3D do case, botões e suportes internos.                   |
| 1          | Kit de Parafusos e Porcas   | Conjunto (M3, M4) para montagem da estrutura e fixação dos componentes.           |
| **Fiação e Conexões**                 |||
| 1          | Kit de Fios Jumper          | Para conectar os módulos (teclado, display, SD card) à placa BitDogLab.           |

---

> Documento criado para fins educacionais e de prototipagem.
