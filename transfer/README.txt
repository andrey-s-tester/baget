Перенос Yanak — содержимое папки transfer/

1) yanak-database.sql.gz — дамп PostgreSQL (сжатый). Для импорта:
   gunzip -c yanak-database.sql.gz | docker exec -i <postgres_container> psql -U yanak -d yanak -v ON_ERROR_STOP=1

2) yanak-database.sql — тот же дамп без gzip (удобно смотреть / импорт без gunzip).

3) yanak-project-source.tar.gz — исходники без node_modules, .git, .next, dist-pack, bundled-ui и т.п.
   Распаковка: tar xzf yanak-project-source.tar.gz
   Далее: npm install, скопировать .env, docker compose up.

Файл .env в архив не входит (секреты) — перенесите вручную или соберите из .env.example на сервере.
