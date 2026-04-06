-- AlterEnum: новые роли бэкофиса
ALTER TYPE "UserRole" ADD VALUE 'seller';
ALTER TYPE "UserRole" ADD VALUE 'dealer';
ALTER TYPE "UserRole" ADD VALUE 'master';
