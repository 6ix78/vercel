import chalk from 'chalk';
import { Project } from '@vercel-internals/types';
import {
  Output,
  isValidEnvTarget,
  getEnvTargetPlaceholder,
  emoji,
  prependEmoji,
  isKnownError,
  getCommandName,
  isAPIError,
  confirm,
  removeEnvRecord,
  getEnvRecords,
  formatEnvTarget,
  Client,
  stamp,
  param,
} from '@vercel-internals/utils';

type Options = {
  '--debug': boolean;
  '--yes': boolean;
};

export default async function rm(
  client: Client,
  project: Project,
  opts: Partial<Options>,
  args: string[],
  output: Output
) {
  // improve the way we show inquirer prompts
  require('../../util/input/patch-inquirer');

  if (args.length > 3) {
    output.error(
      `Invalid number of arguments. Usage: ${getCommandName(
        `env rm <name> ${getEnvTargetPlaceholder()} <gitbranch>`
      )}`
    );
    return 1;
  }

  let [envName, envTarget, envGitBranch] = args;

  while (!envName) {
    const { inputName } = await client.prompt({
      type: 'input',
      name: 'inputName',
      message: `What’s the name of the variable?`,
    });

    if (!inputName) {
      output.error(`Name cannot be empty`);
      continue;
    }

    envName = inputName;
  }

  if (!isValidEnvTarget(envTarget)) {
    output.error(
      `The Environment ${param(
        envTarget
      )} is invalid. It must be one of: ${getEnvTargetPlaceholder()}.`
    );
    return 1;
  }

  const result = await getEnvRecords(
    output,
    client,
    project.id,
    'vercel-cli:env:rm',
    {
      target: envTarget,
      gitBranch: envGitBranch,
    }
  );

  let envs = result.envs.filter(env => env.key === envName);

  if (envs.length === 0) {
    output.error(`Environment Variable was not found.\n`);
    return 1;
  }

  while (envs.length > 1) {
    const { id } = await client.prompt({
      name: 'id',
      type: 'list',
      message: `Remove ${envName} from which Environments?`,
      choices: envs.map(env => ({ value: env.id, name: formatEnvTarget(env) })),
    });

    if (!id) {
      output.error('Please select at least one Environment Variable to remove');
    }
    envs = envs.filter(env => env.id === id);
  }
  const env = envs[0];

  const skipConfirmation = opts['--yes'];
  if (
    !skipConfirmation &&
    !(await confirm(
      client,
      `Removing Environment Variable ${param(env.key)} from ${formatEnvTarget(
        env
      )} in Project ${chalk.bold(project.name)}. Are you sure?`,
      false
    ))
  ) {
    output.log('Canceled');
    return 0;
  }

  const rmStamp = stamp();

  try {
    output.spinner('Removing');
    await removeEnvRecord(output, client, project.id, env);
  } catch (err: unknown) {
    if (isAPIError(err) && isKnownError(err)) {
      output.error(err.serverMessage);
      return 1;
    }
    throw err;
  }

  output.print(
    `${prependEmoji(
      `Removed Environment Variable ${chalk.gray(rmStamp())}`,
      emoji('success')
    )}\n`
  );

  return 0;
}
