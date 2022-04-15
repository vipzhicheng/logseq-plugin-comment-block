import '@logseq/libs';
import { BlockEntity } from '@logseq/libs/dist/LSPlugin';
import { format } from 'date-fns';

const settingsVersion = 'v2';
export const defaultSettings = {
  showToolbarIcon: true,
  keyBindings: {
    commentBlock: 'mod+shift+i',
  },
  settingsVersion,
  disabled: false,
};

export type DefaultSettingsType = typeof defaultSettings;

const initSettings = () => {
  let settings = logseq.settings;

  const shouldUpdateSettings =
    !settings || settings.settingsVersion != defaultSettings.settingsVersion;

  if (shouldUpdateSettings) {
    settings = defaultSettings;
    logseq.updateSettings(settings);
  }
};

const getSettings = (
  key: string | undefined,
  defaultValue: any = undefined
) => {
  let settings = logseq.settings;
  const merged = Object.assign(defaultSettings, settings);
  return key ? (merged[key] ? merged[key] : defaultValue) : merged;
};

async function getLastBlock(pageName: string): Promise<null | BlockEntity> {
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (blocks.length === 0) {
    return null;
  }
  return blocks[blocks.length - 1];
}

const handler = async (e: any) => {
  const block = await logseq.Editor.getBlock(e.uuid);
  if (!block || !block.uuid) {
    return;
  }
  const config = await logseq.App.getUserConfigs();
  if (!block?.properties?.id) {
    await logseq.Editor.upsertBlockProperty(e.uuid, 'id', e.uuid);
  }

  const page = await logseq.Editor.getPage(block.page.id);
  if (page?.name) {
    const blocks = await logseq.Editor.getPageBlocksTree(page.name);
    let findCommentBlock = blocks.find(
      item => item.content && item.content.startsWith('[[Comments]]')
    );

    const lastBlock = await getLastBlock(page.name);
    // Find Comment block
    if (!findCommentBlock && lastBlock?.uuid) {
      const newCommentBlock = await logseq.Editor.insertBlock(
        lastBlock.uuid,
        '[[Comments]]',
        {
          sibling: true,
          before: false,
          properties: {
            collapsed: true,
          },
        }
      );
      if (newCommentBlock) {
        findCommentBlock = newCommentBlock;
      }
    }

    // Insert Comment blocks
    if (findCommentBlock) {
      const todayTitle = format(new Date(), config.preferredDateFormat);

      // Reuse today block
      let todayBlock, findTodayBlock: any;
      if (findCommentBlock.children && findCommentBlock.children.length > 0) {
        findTodayBlock = findCommentBlock.children.find(
          (item: any) =>
            item.content && item.content.startsWith(`[[${todayTitle}]]`)
        );
        if (findTodayBlock?.uuid) {
          todayBlock = findTodayBlock;
        } else {
          todayBlock = await logseq.Editor.insertBlock(
            findCommentBlock.uuid,
            `[[${todayTitle}]]`,
            {
              sibling: false,
              properties: {
                collapsed: true,
              },
            }
          );
        }
      } else {
        todayBlock = await logseq.Editor.insertBlock(
          findCommentBlock.uuid,
          `[[${todayTitle}]]`,
          {
            sibling: false,
            properties: {
              collapsed: true,
            },
          }
        );
      }

      if (todayBlock?.uuid) {
        // Reuse block ref block
        let blockRefBlock, findBlockRefBlock;

        if (todayBlock.children && todayBlock.children.length > 0) {
          findBlockRefBlock = todayBlock.children.find(
            (item: any) =>
              item.content && item.content.startsWith(`((${e.uuid}))`)
          );
          if (findBlockRefBlock?.uuid) {
            blockRefBlock = findBlockRefBlock;
          } else {
            blockRefBlock = await logseq.Editor.insertBlock(
              todayBlock?.uuid,
              `((${e.uuid}))`,
              {
                sibling: false,
              }
            );
          }
        } else {
          blockRefBlock = await logseq.Editor.insertBlock(
            todayBlock?.uuid,
            `((${e.uuid}))`,
            {
              sibling: false,
            }
          );
        }

        if (blockRefBlock?.uuid) {
          await logseq.Editor.openInRightSidebar(blockRefBlock?.uuid);

          // Reuse the empty block
          let emptyBlock;
          if (blockRefBlock.children && blockRefBlock.children.length > 0) {
            const lastEditingBlock =
              blockRefBlock.children[blockRefBlock.children.length - 1];
            if (lastEditingBlock?.content.length === 0) {
              emptyBlock = lastEditingBlock;
            }
          }

          if (!emptyBlock) {
            emptyBlock = await logseq.Editor.insertBlock(
              blockRefBlock?.uuid,
              '',
              {
                sibling: false,
              }
            );
          }

          if (emptyBlock?.uuid) {
            await logseq.Editor.editBlock(emptyBlock?.uuid);
          }
        }
      }
    }
  }
};

async function main() {
  initSettings();
  const keyBindings = getSettings('keyBindings');
  logseq.Editor.registerSlashCommand(`Comment block`, handler);
  logseq.Editor.registerBlockContextMenuItem(`Comment block`, handler);

  logseq.App.registerCommandPalette(
    {
      key: `comment-block`,
      label: `Comment block`,
      keybinding: {
        mode: 'global',
        binding: keyBindings.commentBlock,
      },
    },
    handler
  );
}
logseq.ready(main).catch(console.error);
