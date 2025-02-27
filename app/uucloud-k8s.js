const {
    readEnvironmentConfiguration,
    readEnvironmentsConfiguration,
} = require("./modules/configuration/configuration-reader-module");
const {evaluatePodMetadata, evaluateExtraPods} = require("./modules/evalution-module");
const {getPodsMetadata} = require("./modules/k8s/kubectl-pod-details-module");
const {printNoVerboseStatus, printVerbose} = require("./modules/print/console-print-module");
const {printToBookkit} = require("./modules/print/bookkit-print-module");
const {CONSOLE_LOG} = require("./logger/logger");
const {getDeploymentMetadata} = require("./modules/k8s/kubectl-deployment-details-module");
const {updateDeployment} = require("./modules/k8s/kubectl-deployment-update-module");
const {storeDeployments} = require("./modules/io/file-write-helper");
const {subAppNameExtractor, deploymentNameExtractor} = require("./modules/c3/c3-search-helper");
const packageJson = require("../package.json");
const {sendEmailNotification} = require("./modules/email/email-notification-module");
const {getOverviewResult} = require("./modules/overview-module");
const {printOverviewToBookkit} = require("./modules/print/bookkit-overview-module");
const {scaleUuAppUp, scaleUuAppDown} = require("./modules/k8s/kubectl-deployment-scale-module");
const {scale} = require("./command/scale/scale-service");
const {storeLogsForDeployment} = require("./modules/k8s/kubectl-deployment-logs-module");

const check = async cmdArgs => {
    let environmentConfiguration = readEnvironmentConfiguration(cmdArgs);
    let pods = await getPodsMetadata(cmdArgs);
    let evaluationResult = evaluatePodMetadata(pods, environmentConfiguration, cmdArgs);
    let extraPodsNotInConfiguration = evaluateExtraPods(pods, environmentConfiguration, cmdArgs);

    if (cmdArgs.noverbose) {
        printNoVerboseStatus(evaluationResult, cmdArgs)
    } else {
        printVerbose(evaluationResult, cmdArgs);
    }

    if (extraPodsNotInConfiguration?.length > 0) {
        CONSOLE_LOG.info(`${extraPodsNotInConfiguration.length} extra pod/s found within k8s cluster, which is missing in the configuration.`);
        console.table(extraPodsNotInConfiguration);
    }
    await sendEmailNotification(evaluationResult, cmdArgs);
}

/**
 * Print environment related information according the defined cmd arguments.
 *
 * Task is dedicated specifically for printing into the specific bookkit page.
 *
 * @param cmdArgs
 * @returns {Promise<void>}
 */
const print = async cmdArgs => {
    let environmentConfiguration = readEnvironmentConfiguration(cmdArgs);
    let pods = await getPodsMetadata(cmdArgs);
    let evaluationResult = evaluatePodMetadata(pods, environmentConfiguration, cmdArgs);

    await printToBookkit(evaluationResult, cmdArgs);
    CONSOLE_LOG.debug(`${cmdArgs.environment.toUpperCase()} environment details stored into the bookkit page.`);

    await sendEmailNotification(evaluationResult, cmdArgs);
}

const update = async cmdArgs => {
    let environmentConfiguration = readEnvironmentConfiguration(cmdArgs);
    let pods = await getPodsMetadata(cmdArgs);
    let evaluationResult = evaluatePodMetadata(pods, environmentConfiguration, cmdArgs);

    let deployments = await getDeploymentMetadata(cmdArgs);

    await storeDeployments(deployments);

    let subApps = evaluationResult
        .filter(subAppResult => subAppResult?.NODE_SELECTOR?.includes("NOK"))
        .map(subApp => {
            const foundDeployment = deployments.find(deployment => subAppNameExtractor(deployment) === subApp.subApp)
            return {
                ...subApp,
                deploymentName: deploymentNameExtractor(foundDeployment)
            }
        });

    for (const subAppEvaluation of subApps) {
        const subAppConfiguration = environmentConfiguration[subAppEvaluation.subApp];
        await updateDeployment(subAppEvaluation, subAppConfiguration, cmdArgs);
    }

    await storeDeployments(deployments, "-updated");
}

const scaleUp = async cmdArgs => {
    await scale(cmdArgs, scaleUuAppUp);
}

const scaleDown = async cmdArgs => {
    await scale(cmdArgs, scaleUuAppDown);
}

/**
 * Extract logs from the namespace for every deployment in the given environment.
 *
 * @param cmdArgs
 * @returns {Promise<void>}
 */
const logs = async cmdArgs => {
    readEnvironmentConfiguration(cmdArgs);
    let deployments = await getDeploymentMetadata(cmdArgs);
    const deploymentNames = deployments.map(item => item.metadata.name);
    const executionTime = Date.now();
    for (const deploymentName of deploymentNames) {
        await storeLogsForDeployment(cmdArgs, deploymentName, executionTime);
    }
}

/**
 * Generate overview defined in the configuration
 *
 * @param cmdArgs
 * @returns {Promise<void>}
 */
const overview = async cmdArgs => {
    let environments = readEnvironmentsConfiguration(cmdArgs);
    const overview = getOverviewResult(cmdArgs, environments);

    await printOverviewToBookkit(overview, cmdArgs)
}

const help = usage => {
    CONSOLE_LOG.debug(usage);
}

const version = () => {
    CONSOLE_LOG.debug(packageJson.version);
}

module.exports = {
    check,
    print,
    update,
    logs,
    scaleUp,
    scaleDown,
    help,
    overview,
    version
}