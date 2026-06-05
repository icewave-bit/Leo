/**
 * Нужен для `pnpm dev`: иначе `/env-config.js` из index.html даст 404.
 * В образе env-driven-static-server этот файл удаляют в Dockerfile: их inject-env-vars.sh
 * дописывает в файл через `>>`, а не перезаписывает — иначе содержимое склеилось бы с заглушкой.
 */
window._env_ = window._env_ || {};
