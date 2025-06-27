# Confluence Batch Export

This project is used to batch export all pages under a Confluence space as PDF files.

## Usage

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

Create a `.env` file in the root directory of the project with the following content:

```
CONFLUENCE_TOKEN=your Confluence Token
CONFLUENCE_HOME_URL=your Confluence space home URL
```

3. Run the script:

```bash
npm run start
```

4. The exported PDF files will be saved in the `downloads/` directory.

## Notes

- You need access permission to the corresponding Confluence space.
- This script uses [Playwright](https://playwright.dev/) for automation.
