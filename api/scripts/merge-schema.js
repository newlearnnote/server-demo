const fs = require('fs');
const path = require('path');

function mergeSchemaFiles() {
  const schemaDir = path.join(__dirname, '../prisma/schema');
  const outputFile = path.join(schemaDir, 'schema.prisma');

  // 기본 스키마 (generator와 datasource)
  const baseSchema = `// ===== GENERATOR & DATASOURCE =====

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

`;

  let mergedContent = baseSchema;

  // 각 디렉터리의 스키마 파일들을 읽어서 병합
  const directories = ['account', 'payment', 'service'];

  directories.forEach((dir) => {
    const dirPath = path.join(schemaDir, dir);
    if (!fs.existsSync(dirPath)) return;

    mergedContent += `// ===== ${dir.toUpperCase()} MODELS =====\n\n`;

    const files = fs
      .readdirSync(dirPath)
      .filter((file) => file.endsWith('.prisma'));

    files.forEach((file) => {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf8');
      mergedContent += content + '\n\n';
    });
  });

  // 병합된 스키마를 메인 파일에 쓰기
  fs.writeFileSync(outputFile, mergedContent);
  console.log('✅ Schema files merged successfully!');
}

// 스크립트 실행
mergeSchemaFiles();
