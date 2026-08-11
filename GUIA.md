# Guia passo a passo (para quem nunca usou terminal)

Este guia leva você do zero até o seu painel de viagens pronto. Não precisa saber programar — é copiar, colar e apertar Enter. Reserve uns 20 minutos (a maior parte é só esperar o Instagram preparar seu backup).

> Quer ver como fica **antes** de baixar o seu? A ferramenta vem com um exemplo fictício. Pule para [Testar com o exemplo](#testar-com-o-exemplo).

---

## Parte 1 — Pedir seu backup ao Instagram

O Instagram guarda a localização (GPS) de parte das suas fotos e vídeos. A gente só precisa desse arquivo.

1. Abra a **Central de Contas** direto neste link: **https://accountscenter.instagram.com/** (faça login se pedir).
2. Vá em **Suas informações e permissões** → **Baixar suas informações**.
   > Pelo app dá no mesmo: **Configurações → Central de Contas → Suas informações e permissões → Baixar suas informações**.
3. Toque em **Solicitar download** → escolha sua conta.
4. Em **Tipo de informações**, pode deixar tudo (ou marcar só **Conteúdo** → *Fotos, vídeos e stories* — é o que importa).
5. Configurações importantes:
   - **Formato**: escolha **JSON** (não HTML). ⚠️ Isso é essencial.
   - **Intervalo de datas**: **Desde o início**.
   - **Qualidade de mídia**: qualquer uma serve (não usamos as fotos em si, só a localização).
6. Confirme. O Instagram vai **preparar o arquivo** — pode levar de alguns minutos a algumas horas. Você recebe um **e-mail** quando ficar pronto.
7. Quando chegar o e-mail, clique em **Baixar informações** e salve o(s) arquivo(s) **.zip** no seu computador — por exemplo na pasta **Downloads**. Pode vir 1 arquivo ou vários; deixe todos juntos na mesma pasta.

Você **não precisa descompactar** — a ferramenta faz isso sozinha.

---

## Parte 2 — Instalar o que precisa (uma vez só)

A ferramenta roda com **Python**. Provavelmente você ainda não tem.

### No Mac
1. Baixe o Python em [python.org/downloads](https://www.python.org/downloads/) e instale (avançar, avançar, concluir).
2. Abra o **Terminal**: aperte `Cmd + Espaço`, digite **Terminal**, Enter. Vai abrir uma janelinha onde você digita comandos.

### No Windows
1. Baixe o Python em [python.org/downloads](https://www.python.org/downloads/). **Na primeira tela do instalador, marque a caixinha "Add Python to PATH"** e depois instale.
2. Abra o **Prompt de Comando**: aperte a tecla Windows, digite **cmd**, Enter.

---

## Parte 3 — Baixar e preparar a ferramenta (uma vez só)

Copie e cole **um comando de cada vez** na janela que você abriu, apertando Enter depois de cada um.

Baixar a ferramenta:
```bash
git clone https://github.com/eduardogama-zero/insta-flight-log.git
```
> Se disser que `git` não existe: no Mac, digite `git` e o sistema oferece instalar; no Windows, instale de [git-scm.com](https://git-scm.com/download/win). Alternativa sem git: no GitHub, botão verde **Code → Download ZIP**, e descompacte.

Entrar na pasta:
```bash
cd insta-flight-log
```

Criar um "ambiente" isolado e instalar a dependência:
```bash
python3 -m venv .venv
```
```bash
./.venv/bin/pip install -r requirements.txt
```
> No **Windows**, troque os dois comandos acima por: `python -m venv .venv` e depois `.venv\Scripts\pip install -r requirements.txt`.

---

## Parte 4 — Gerar o seu painel

Um comando só. Troque o caminho pela pasta onde você salvou os `.zip` do Instagram:

```bash
./.venv/bin/python instatravel.py ~/Downloads/pasta-do-seu-backup
```
> No **Windows**: `.venv\Scripts\python instatravel.py C:\Users\SEU_NOME\Downloads\pasta-do-seu-backup`

Ele descompacta, lê tudo e abre um arquivo **`mapa_viagens.html`** no seu navegador. Pronto — esse é o seu painel. É um arquivo só; você pode guardar, mandar pra alguém, abrir quando quiser.

---

## Testar com o exemplo

Quer ver funcionando na hora, sem esperar o Instagram? Depois da Parte 3, rode:

```bash
./.venv/bin/python instatravel.py sample-export --handle "@viajante_demo"
```

Isso usa um viajante fictício que já vem no projeto e abre um painel de demonstração.

---

## Dicas

- **Viajei pra um lugar mas não aparece.** O Instagram só guarda GPS em parte das mídias, então viagens sem foto geolocalizada não entram sozinhas. Dá pra adicioná-las à mão: copie o arquivo `manual_entries.example.json` para `manual_entries.json` (na mesma pasta do `mapa_viagens.html`), edite com o destino/data e rode de novo.
- **Descobrir viagens escondidas nas legendas.** Rode com `--suggest` no fim do comando: ele varre suas legendas e grava um `suggestions.json` com destinos que você mencionou mas não têm GPS — pra você revisar.
- **Custo em executiva.** Por padrão o custo assume tudo econômica. Se voou executiva algumas vezes, some `--exec-legs 4` (nº de trechos internacionais na executiva).
- **Ver todas as opções:** `./.venv/bin/python instatravel.py -h`

## Privacidade

Tudo roda **no seu computador**. Nada é enviado pra nenhum servidor. A única coisa que usa internet é o **fundo do mapa** (as ruas/países) quando você abre o painel — e mesmo sem internet ele funciona, só fica com o fundo escuro.
