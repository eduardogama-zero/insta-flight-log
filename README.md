# insta-travel-map ✈️

Transforma o **backup do seu Instagram** num painel de viagens interativo — mapa de rotas de voo, mapa de calor, linha do tempo, estatísticas (países, cidades, horas de voo, km, custo estimado) e uma lista de viagens reconstruídas.

**100% local. Nada sai da sua máquina.** Sem nuvem, sem API paga, **sem LLM**. É um parser determinístico: o export do Instagram é JSON estruturado e as fotos/vídeos carregam GPS no EXIF — só precisamos ler.

> Painel gerado 100% a partir do seu backup — mapa de rotas, mapa de calor, timeline com replay e estatísticas.

## Como funciona

O Instagram grava, em parte das mídias, a coordenada GPS no EXIF (`your_instagram_activity/media/*.json`). A ferramenta:

1. Lê todas as mídias com GPS + data + legenda;
2. Agrupa os pontos em cidades (clusterização geográfica);
3. Nomeia cada cidade **offline** (`reverse_geocoder`, base GeoNames embutida);
4. Reconstrói a sequência de voos (pernas ≥ 300 km) e as viagens;
5. Calcula estatísticas, custo estimado e um painel HTML autocontido.

> ⚠️ O GPS só existe em parte das mídias, então o resultado é um **piso**, não um teto. Viagens sem foto geotagueada não aparecem — mas você pode adicioná-las à mão (veja *Entradas manuais*).

## Instalação

Precisa de **Python 3.8+**.

```bash
git clone https://github.com/eduardogama-zero/insta-travel-map.git
cd insta-travel-map
pip install -r requirements.txt
```

## Baixar seu backup do Instagram

Instagram → **Configurações → Central de contas → Suas informações e permissões → Baixar suas informações** → peça em **formato JSON**, período **Desde o início**, qualidade de mídia à escolha. Você recebe um ou vários `.zip`.

## Uso

Aponte para a pasta com os `.zip` (descompacta sozinho) **ou** para a pasta já extraída:

```bash
python instatravel.py ~/Downloads/instagram-export/
```

Gera `mapa_viagens.html` e abre no navegador. Opções úteis:

```bash
# rótulo do topo, saída e sem abrir o navegador
python instatravel.py PASTA --handle @seuusuario -o meu_mapa.html --no-open

# varrer legendas e sugerir viagens SEM GPS (para revisão)
python instatravel.py PASTA --suggest        # grava suggestions.json

# custo: nº de trechos internacionais na executiva e moeda
python instatravel.py PASTA --exec-legs 5 --currency "R$"
```

Todas as opções: `python instatravel.py -h`.

## Entradas manuais (viagens sem GPS)

Copie `manual_entries.example.json` para **`manual_entries.json`** (na pasta de saída) e edite. Cada entrada entra nos totais e no mapa, sem marcação diferente. Rode de novo para reprocessar. Para descobrir candidatos, use `--suggest`.

## Custo estimado

Modelo simples por km, configurável (`--rate-dom`, `--rate-intl`, `--rate-intl-exec`, `--exec-legs`). "Doméstico" = seu país de residência (cidade com mais mídias). É **ordem de grandeza** em moeda atual, por passageiro — não corrige inflação/câmbio por ano e não sabe quem pagou (você ou empresa).

## Privacidade

Tudo roda offline. O único acesso à rede é o **mapa-base** (tiles do OpenStreetMap/CARTO) quando você abre o HTML — nenhum dado seu é enviado. Rode sem internet e o painel funciona (o mapa fica sem o fundo).

## Limitações

- Só enxerga mídias com GPS no EXIF (nem toda foto tem).
- Geocoding offline é a nível de cidade.
- Voos e horas são estimados (pernas ≥ 300 km, 800 km/h + 0,5 h/perna).

## Licença

MIT.
