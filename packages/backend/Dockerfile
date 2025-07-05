# --- Build Stage (Simplified) ---
FROM node:20-alpine AS builder

WORKDIR /app

# pnpm のインストール
RUN npm install -g pnpm

# 依存関係のインストール
COPY package.json ./ 
RUN pnpm install --prod=false # 開発依存関係もインストール

# ソースコードのコピー (ビルド済みファイルは Production Stage でコピー)
COPY . .

# --- Production Stage ---
FROM node:20-alpine AS production

WORKDIR /app

# pnpm のインストール (本番環境用)
RUN npm install -g pnpm

# 依存関係のインストール (本番環境用)
COPY package.json ./ 
RUN pnpm install --prod # 本番依存関係のみインストール

# ビルド済みファイルをコピー
COPY --from=builder /app/dist ./dist

# ポート設定 (Cloud Run は PORT 環境変数を使用)
ENV PORT 8080
EXPOSE 8080

CMD ["node", "dist/index.js"]
