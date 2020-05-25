import * as core from '@actions/core'
import { GitHub } from '@actions/github'
import { context } from '@actions/github'

const valid_statuses = ["queued", "in_progress", "completed"] as const;
const valid_conclusions = ["success", "failure", "neutral", "cancelled", "timed_out", "action_required"] as const;
type Status = typeof valid_statuses[number]
type Conclusion = typeof valid_conclusions[number]

function IsValidStatus(status: string): status is Status {
    return valid_statuses.find(item => { return item === status }) != null
}

function IsValidConclusion(conclusion: string): conclusion is Conclusion {
    return valid_conclusions.find(item => { return item === conclusion }) != null
}

function IsValidJson(str: string): boolean {
    try {
        JSON.parse(str)
    } catch (e) {
        return false
    }
    return true
}

function StringArrayFromJson(json: string): [string] {
    if (json != null && typeof json === 'string' && !IsValidJson(json)) {
        json = `[${ json }]`
    }

    if (json == null) {
        json = '[]'
    }

    if (!IsValidJson(json)) {
        throw new Error(`Invalid JSON: ${ json }`)
    }
    return JSON.parse(json) as [string]
}

function IntArrayFromJson(json: string): [number] {
    if (json != null && typeof json === 'string' && !IsValidJson(json)) {
        json = `[${ json }]`
    }

    if (json == null) {
        json = '[]'
    }

    if (!IsValidJson(json)) {
        throw new Error(`Invalid JSON: ${ json }`)
    }
    return JSON.parse(json) as [number]
}

async function update(token: string, owner: string, repo: string, ids: [number], statuses: [string], conclusions: [string]): Promise<any> {
    const client = new GitHub(token)

    var requests = []
    for (var i = 0; i < ids.length; ++i) {
        requests.push(
            client.checks.update({
                check_run_id: ids[i],
                owner: owner,
                repo: repo,
                status: statuses[i] as Status,
                conclusion: conclusions.length > 0 ? conclusions[i] as Conclusion : undefined
            })
        )
    }

    const responses = await Promise.all(requests)
    return responses.map(response => { return response.data.id || -1 })
}

async function main(): Promise<void> {
    try {
        let ids = IntArrayFromJson(core.getInput('check_ids', { required: true }))
        let statuses = StringArrayFromJson(core.getInput('statuses', { required: true }))
        let conclusions = StringArrayFromJson(core.getInput('conclusions', { required: false }) || '[]')

        if (!Array.isArray(ids) || !ids.every(item => typeof item === 'number')) {
            core.setFailed('ERROR: check_ids must be an array of integers.')
            return
        }

        if (!Array.isArray(statuses) || statuses.length <= 0 || !statuses.every(item => { return IsValidStatus(item) })) {
            core.setFailed('ERROR: statuses must be an array of valid status strings.')
            return
        }

        if (!Array.isArray(conclusions) || !conclusions.every(item => { return IsValidConclusion(item) })) {
            core.setFailed('ERROR: conclusions must be an array of valid conclusion strings or empty.')
            return
        }

        const token = core.getInput('github_token', { required: true })
        const owner = core.getInput('owner') || context.repo.owner
        const repo = core.getInput('repo') || context.repo.repo

        if (statuses.length != ids.length) {
            core.setFailed('ERROR: statuses and ids do not match.')
            return
        }

        if (conclusions.length > 0 && conclusions.length != statuses.length) {
            core.setFailed('ERROR: conclusions and statuses do not match.')
            return
        }

        const result = await update(
            token,
            owner,
            repo,
            ids,
            statuses as [string],
            conclusions as [string]
        )

        if (result == null) {
            core.setFailed('Unable to update check-run.')
            return
        }

        core.setOutput('result', JSON.stringify(result))
    } catch (error) {
        core.setFailed(error.message)
    }
}

main()