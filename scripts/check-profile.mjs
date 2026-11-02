import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'profile.config.json'), 'utf8'));
const requiredColors = ['page', 'panel', 'well', 'text1', 'text2', 'text3', 'line', 'lineFaint', 'accent', 'selected', 'ok', 'warn', 'fail', 'languageFallback'];
const missing = requiredColors.filter((key) => !config.theme?.[key]);
if (missing.length) throw new Error(`Missing theme colors: ${missing.join(', ')}`);
if (!Array.isArray(config.theme?.auroraPalette) || config.theme.auroraPalette.length < 2) throw new Error('theme.auroraPalette needs at least two colors');
if (!config.github?.username) throw new Error('github.username is required');
if (!Array.isArray(config.github.featuredRepos) || !config.github.featuredRepos.length) throw new Error('Choose at least one github.featuredRepos entry');
if (new Set(config.github.featuredRepos).size !== config.github.featuredRepos.length) throw new Error('github.featuredRepos contains duplicates');
if ((config.motion?.speed || 0) <= 0) throw new Error('motion.speed must be greater than zero');
if ((config.motion?.auroraFrames || 0) < 2) throw new Error('motion.auroraFrames must be at least two');
if (![1, 2].includes(config.layout?.projectColumns)) throw new Error('layout.projectColumns must be 1 or 2');
console.log('profile.config.json looks good.');
