-- Nome da campanha (opcional). Sem nome, a lista mostra a primeira linha do texto.
-- Só aditivo. Rodar ANTES do deploy do app (o Prisma passa a ler a coluna).
ALTER TABLE eva_studio_broadcasts ADD COLUMN IF NOT EXISTS "name" text;
