-- +goose Up
ALTER TABLE user ADD COLUMN theme VARCHAR(50) NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE user DROP COLUMN theme;
