import postcss from "postcss"
import rc from "rc"
import path from "path"
import resolveFrom from "resolve-from"
import { merge, cloneDeep, isEmpty } from "lodash"
import { configurationError } from "./utils"
import ruleDefinitions from "./rules"
import disableRanges from "./disableRanges"

export default postcss.plugin("stylelint", (options = {}) => {
  return (root, result) => {
    // result.stylelint is the namespace for passing stylelint-related
    // configuration and data across sub-plugins via the PostCSS Result
    result.stylelint = result.stylelint || {}
    result.stylelint.ruleSeverities = {}

    let initialConfig = options.hasOwnProperty("config") ? options.config : options
    if (isEmpty(initialConfig)) {
      initialConfig = rc("stylelint")
    }

    const configBasedir = options.configBasedir || path.dirname(initialConfig.config)
    const config = extendConfig(initialConfig, configBasedir)

    if (config.plugins) {
      Object.keys(config.plugins).forEach(pluginName => {
        ruleDefinitions[pluginName] = require(modulePath(config.plugins[pluginName], configBasedir))
      })
    }

    if (options.configOverrides) {
      merge(config, options.configOverrides)
    }

    if (!config) {
      throw configurationError("No configuration provided")
    }
    if (!config.rules) {
      throw configurationError("No rules found within configuration")
    }

    // Register details about the configuration
    result.stylelint.quiet = config.quiet

    // First check for disabled ranges, adding them to the result object
    disableRanges(root, result)

    Object.keys(config.rules).forEach(ruleName => {
      if (!ruleDefinitions[ruleName]) {
        throw configurationError(`Undefined rule ${ruleName}`)
      }

      // If severity is 0, run nothing
      const ruleSettings = config.rules[ruleName]
      const ruleSeverity = (Array.isArray(ruleSettings))
        ? ruleSettings[0]
        : ruleSettings
      if (ruleSeverity === 0) {
        return
      }

      // Log the rule's severity
      result.stylelint.ruleSeverities[ruleName] = ruleSeverity

      // Run the rule with the primary and secondary options
      ruleDefinitions[ruleName](ruleSettings[1], ruleSettings[2])(root, result)
    })
  }
})

function extendConfig(config, configBasedir) {
  if (!config.extends) { return config }

  return [].concat(config.extends).reduce((mergedConfig, extendingConfigLookup) => {
    let extendingConfigPath = modulePath(extendingConfigLookup, configBasedir || process.cwd())

    // Now we must recursively extend the extending config
    let extendingConfig = extendConfig(require(extendingConfigPath), path.dirname(extendingConfigPath))

    return merge({}, extendingConfig, mergedConfig)
  }, cloneDeep(config))
}

function modulePath(lookup, basedir) {
  try {
    return resolveFrom(basedir, lookup)
  } catch (e) {
    throw configurationError(
      `Could not find "${lookup}". ` +
      `Do you need a \`configBasedir\`?`
    )
  }
}
