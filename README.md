# SentinelRisk

SentinelRisk es un MVP web local para importar y gestionar hallazgos de vulnerabilidades de reportes de Fortify, Nexus IQ y Qualys. La interfaz está en español y procesa los archivos directamente en el navegador.

## Ejecución local

Requisitos:

- Python 3, para iniciar un servidor web local.
- Un navegador moderno.
- Conexión a Internet para cargar las bibliotecas JavaScript que se incluyen desde CDN en `index.html`.

Desde la carpeta del proyecto, ejecuta:

```bash
python -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000) en el navegador. Para detener el servidor, usa `Ctrl+C` en la terminal.

Se recomienda usar `localhost` en lugar de abrir `index.html` directamente: la aplicación utiliza módulos JavaScript, IndexedDB y Web Crypto.

## Uso

1. Selecciona un perfil de demostración: Analista, Administrador o Lector/Auditor.
2. Inicia sesión con el botón de SSO simulado.
3. Importa un archivo CSV, XLS o XLSX de Fortify, Nexus IQ o Qualys.
4. Explora los hallazgos con los filtros de severidad, fuente y búsqueda; desde la tabla también puedes revisar y remediar hallazgos según el perfil.
5. Usa **Exportar consolidado** para descargar en CSV los hallazgos que coinciden con los filtros activos.

La importación admite archivos de hasta 20 MB. En archivos XLS/XLSX se procesa la primera hoja.

## Datos y autenticación

Los hallazgos se guardan en IndexedDB del navegador. La sesión de demostración se almacena en `sessionStorage` y el registro de auditoría local en `localStorage`; los datos no se envían a un servidor de SentinelRisk. La autenticación y los permisos son solo una simulación para demostración y no deben considerarse una medida de seguridad para producción.

Los datos permanecen en el perfil del navegador donde se ejecuta la aplicación. Borrar los datos del navegador puede eliminar hallazgos y auditoría almacenados localmente.

## Validación

No hay un proceso de compilación, gestor de paquetes, suite de pruebas automatizadas ni comando de lint configurados en este proyecto. Para comprobar la sintaxis de un módulo JavaScript con Node.js:

```bash
node --check js/normalizer.js
```

Para comprobar todos los módulos:

```bash
for f in js/*.js; do node --check "$f" || exit 1; done
```

## Tecnologías

- HTML, CSS y módulos JavaScript nativos.
- IndexedDB, `sessionStorage`, `localStorage` y Web Crypto.
- SheetJS, PapaParse, Chart.js y Lucide cargados desde CDN.
