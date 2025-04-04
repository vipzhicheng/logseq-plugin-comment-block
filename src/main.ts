import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin";
import { format } from "date-fns";

const settingsVersion = "v2";
const defaultSettings = {
  showToolbarIcon: true,
  keyBindings: {
    commentBlock: "mod+shift+i",
  },
  settingsVersion,
  disabled: false,
};

type DefaultSettingsType = typeof defaultSettings;

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

const defineSettings = (): SettingSchemaDesc[] => [
  {
    key: "putBlockRefAsChild",
    type: "boolean",
    title: "Put block ref as child",
    description:
      "That means everytime you trigger a comment, it will insert a new block and add commented block ref as child. If you disable this, it will insert a new block as the child of commented block ref. Use this with CAUTION, because the embed feature will not work and it can not reuse the block ref if you trigger comment again.",
    default: false,
  },
];
logseq.useSettingsSchema(defineSettings());

async function getLastBlock(pageName: string): Promise<null | BlockEntity> {
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  if (blocks.length === 0) {
    return null;
  }
  return blocks[blocks.length - 1];
}

const handler = async (e: any) => {
  let block;
  if (e && e.uuid) {
    block = await logseq.Editor.getBlock(e.uuid);
  } else {
    block = await logseq.Editor.getCurrentBlock();
  }
  if (!block || !block.uuid) {
    return;
  }
  const config = await logseq.App.getUserConfigs();
  if (!block?.properties?.id) {
    await logseq.Editor.upsertBlockProperty(e.uuid, "id", e.uuid);
  }

  const page = await logseq.Editor.getPage(block.page.id);
  if (page?.name) {
    const blocks = await logseq.Editor.getPageBlocksTree(page.name);
    let findCommentBlock = blocks.find(
      (item) => item.content && item.content.startsWith("[[Comments]]")
    );

    const lastBlock = await getLastBlock(page.name);
    // Find Comment block
    if (!findCommentBlock && lastBlock?.uuid) {
      const newCommentBlock = await logseq.Editor.insertBlock(
        lastBlock.uuid,
        "[[Comments]]",
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
        // process putBlockRefAsChild
        if (logseq.settings?.putBlockRefAsChild) {
          let commentBlock = await logseq.Editor.insertBlock(
            todayBlock?.uuid,
            ``,
            {
              sibling: false,
            }
          );
          if (commentBlock?.uuid) {
            await logseq.Editor.openInRightSidebar(commentBlock?.uuid);
            await logseq.Editor.insertBlock(
              commentBlock?.uuid,
              `((${e.uuid}))`,
              {
                sibling: false,
              }
            );
            await logseq.Editor.editBlock(commentBlock?.uuid);
          }
        } else {
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
                "",
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
  }
};

const handleEmbed = async (e: any) => {
  let block;
  if (e && e.uuid) {
    block = await logseq.Editor.getBlock(e.uuid);
  } else {
    block = await logseq.Editor.getCurrentBlock();
  }
  if (!block || !block.uuid) {
    return;
  }
  const page = await logseq.Editor.getPage(block.page.id);
  if (page?.name) {
    const blocks = await logseq.Editor.getPageBlocksTree(page.name);
    let findCommentBlock = blocks.find(
      (item) => item.content && item.content.startsWith("[[Comments]]")
    );

    if (findCommentBlock && findCommentBlock.children) {
      for (let block1 of findCommentBlock.children) {
        if (block1) {
          // @ts-ignore
          for (let block2 of block1.children) {
            if (
              (block2 as BlockEntity).content.indexOf(`((${block.uuid}))`) > -1
            ) {
              for (let block3 of block2.children) {
                if (!(block3 as BlockEntity)?.properties?.id) {
                  await logseq.Editor.upsertBlockProperty(
                    (block3 as BlockEntity).uuid,
                    "id",
                    (block3 as BlockEntity).uuid
                  );
                }

                await logseq.Editor.insertBlock(
                  block.uuid,
                  `((${(block3 as BlockEntity).uuid}))`,
                  {
                    before: false,
                    sibling: false,
                  }
                );
              }
            }
          }
        }
      }

      await logseq.Editor.exitEditingMode(true);
    }
  }
};

async function main() {
  initSettings();
  const keyBindings = getSettings("keyBindings");
  logseq.Editor.registerSlashCommand(`Comment block`, handler);
  logseq.Editor.registerBlockContextMenuItem(`Comment block`, handler);
  logseq.App.registerCommandPalette(
    {
      key: `comment-block`,
      label: `Comment block`,
      keybinding: {
        mode: "global",
        binding: keyBindings.commentBlock,
      },
    },
    handler
  );

  logseq.Editor.registerSlashCommand(
    "Embed Comment blocks To Children",
    handleEmbed
  );
  logseq.Editor.registerBlockContextMenuItem(
    `Embed Comment blocks To Children`,
    handleEmbed
  );

  logseq.App.registerCommandPalette(
    {
      key: `embed-comment-block-to-children`,
      label: `Embed comment block to children`,
    },
    handleEmbed
  );
}
logseq.ready(main).catch(console.error);
