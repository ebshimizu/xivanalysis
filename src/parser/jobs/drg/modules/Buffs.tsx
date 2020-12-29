import React from 'react'
import {t} from '@lingui/macro'
import {Trans, Plural} from '@lingui/react'
import {CastEvent} from 'fflogs'

import ACTIONS from 'data/ACTIONS'
import STATUSES from 'data/STATUSES'
import {ActionLink} from 'components/ui/DbLink'
import Module, {dependency} from 'parser/core/Module'
import Checklist, {Rule, Requirement} from 'parser/core/modules/Checklist'
import Suggestions, {Suggestion, TieredSuggestion, SEVERITY} from 'parser/core/modules/Suggestions'
import Combatants from 'parser/core/modules/Combatants'
import {EntityStatuses} from 'parser/core/modules/EntityStatuses'
import {Invulnerability} from 'parser/core/modules/Invulnerability'
import {Data} from 'parser/core/modules/Data'
import DISPLAY_ORDER from './DISPLAY_ORDER'
import _ from 'lodash'
import {PieChartStatistic, Statistics} from 'parser/core/modules/Statistics'

const BAD_LIFE_SURGE_CONSUMERS: number[] = [
	ACTIONS.TRUE_THRUST.id,
	ACTIONS.RAIDEN_THRUST.id,
	ACTIONS.VORPAL_THRUST.id,
	ACTIONS.DISEMBOWEL.id,
	ACTIONS.CHAOS_THRUST.id,
	ACTIONS.PIERCING_TALON.id,
	ACTIONS.DOOM_SPIKE.id,
	ACTIONS.SONIC_THRUST.id,
	ACTIONS.COERTHAN_TORMENT.id,
]

const FINAL_COMBO_HITS: number[] = [
	ACTIONS.FANG_AND_CLAW.id,
	ACTIONS.WHEELING_THRUST.id,
]

// these are the consumers we care to show in the chart
const CHART_LIFE_SURGE_CONSUMERS: number[] = [
	ACTIONS.FULL_THRUST.id,
	ACTIONS.FANG_AND_CLAW.id,
	ACTIONS.WHEELING_THRUST.id,
	ACTIONS.COERTHAN_TORMENT.id,
]

const CHART_COLORS: {[actionId: number]: string} = {
	[ACTIONS.FULL_THRUST.id]: '#0e81f7',
	[ACTIONS.FANG_AND_CLAW.id]: '#b36b00',
	[ACTIONS.WHEELING_THRUST.id]: '#b36b00',
	[ACTIONS.COERTHAN_TORMENT.id]: '#b36b00',
}

const OTHER_ACTION_COLOR: string = '#660000'

export default class Buffs extends Module {
	static handle = 'buffs'
	static title = t('drg.buffs.title')`Buffs`

	private soloDragonSight: boolean = false
	private lifeSurgeCasts: number[] = []

	@dependency private checklist!: Checklist
	@dependency private combatants!: Combatants
	@dependency private entityStatuses!: EntityStatuses
	@dependency private invuln!: Invulnerability
	@dependency private suggestions!: Suggestions
	@dependency private data!: Data
	@dependency private statistics!: Statistics

	init(){
		this.addEventHook('cast', {by: 'player'}, this.onCast)
		this.addEventHook('complete', this.onComplete)
		this.addEventHook('applybuff', {by: 'player', abilityId: STATUSES.RIGHT_EYE_SOLO.id}, () => this.soloDragonSight = true)
	}

	private onCast(event: CastEvent) {
		const action = this.data.getAction(event.ability.guid)
		if (action && action.onGcd) {
			if (this.combatants.selected.hasStatus(STATUSES.LIFE_SURGE.id)) {
				// add to cast list
				this.lifeSurgeCasts.push(action.id)
			}
		}
	}

	private getDisembowelUptimePercent() {
		const statusUptime = this.entityStatuses.getStatusUptime(STATUSES.DISEMBOWEL.id, this.combatants.getEntities())
		const fightUptime = this.parser.currentDuration - this.invuln.getInvulnerableUptime()
		return (statusUptime / fightUptime) * 100
	}

	private onComplete() {
		// make a lil graph of life surge uses
		// get total LS casts
		const totalLsCasts = this.lifeSurgeCasts.length

		// format for graph
		const data = []

		// count the things we care about (total - tracked should equal bad LS uses)
		let trackedCastCount = 0
		for (const actionId of CHART_LIFE_SURGE_CONSUMERS) {
			const value = this.lifeSurgeCasts.filter(i => actionId === i).length

			// don't put 0s in the chart
			if (value === 0)
				continue

			data.push({
				value,
				color: CHART_COLORS[actionId],
				columns: [
					this.data.getAction(actionId)?.name,
					value,
					this.lsCastPercent(value, totalLsCasts),
				] as const,
			})

			trackedCastCount += value
		}

		// push other column if bad use
		const badLifeSurges = totalLsCasts - trackedCastCount
		if (badLifeSurges > 0) {
			const value = totalLsCasts - trackedCastCount

			data.push({
				value,
				color: OTHER_ACTION_COLOR,
				columns: [
					'Other',
					value,
					this.lsCastPercent(value, totalLsCasts),
				] as const,
			})
		}

		if (data.length > 0) {
			this.statistics.add(new PieChartStatistic({
				headings: ['Life Surge Consumer', 'Count', '%'],
				data,
			}))
		}

		this.checklist.add(new Rule({
			name: <Trans id="drg.buffs.checklist.name">Keep {ACTIONS.DISEMBOWEL.name} up</Trans>,
			description: <Trans id="drg.buffs.checklist.description">
				<ActionLink {...ACTIONS.DISEMBOWEL}/> provides a 10% boost to your personal damage and should always be kept up.
			</Trans>,
			displayOrder: DISPLAY_ORDER.DISEMBOWEL,
			requirements: [
				new Requirement({
					name: <Trans id="drg.buffs.checklist.requirement.name"><ActionLink {...ACTIONS.DISEMBOWEL}/> uptime</Trans>,
					percent: () => this.getDisembowelUptimePercent(),
				}),
			],
		}))

		this.suggestions.add(new TieredSuggestion({
			icon: ACTIONS.LIFE_SURGE.icon,
			content: <Trans id="drg.buffs.suggestions.life-surge.content">
				Try to only use <ActionLink {...ACTIONS.LIFE_SURGE} /> on <ActionLink {...ACTIONS.FULL_THRUST} />. In order to keep <ActionLink {...ACTIONS.LIFE_SURGE} /> used on cooldown, it can be used on <ActionLink {...ACTIONS.WHEELING_THRUST} /> if <ActionLink {...ACTIONS.LIFE_SURGE} /> comes off cooldown immediately after <ActionLink {...ACTIONS.FULL_THRUST} />. In multi-target situations, <ActionLink {...ACTIONS.LIFE_SURGE} /> may be used on <ActionLink {...ACTIONS.FANG_AND_CLAW} /> or <ActionLink {...ACTIONS.COERTHAN_TORMENT} />.
			</Trans>,
			tiers: {
				1: SEVERITY.MINOR,
				2: SEVERITY.MEDIUM,
				4: SEVERITY.MAJOR,
			},
			value: badLifeSurges,
			why: <Trans id="drg.buffs.suggestions.life-surge.why">
				You used {ACTIONS.LIFE_SURGE.name} on a non-optimal GCD <Plural value={badLifeSurges} one="# time" other="# times"/>.
			</Trans>,
		}))

		if (this.soloDragonSight) {
			this.suggestions.add(new Suggestion({
				icon: ACTIONS.DRAGON_SIGHT.icon,
				content: <Trans id="drg.buffs.suggestions.solo-ds.content">
					Although it doesn't impact your personal DPS, try to always use <ActionLink {...ACTIONS.DRAGON_SIGHT} /> on a partner in group content so that someone else can benefit from the damage bonus too.
				</Trans>,
				severity: SEVERITY.MINOR,
				why: <Trans id="drg.buffs.suggestions.solo-ds.why">
					At least 1 of your Dragon Sight casts didn't have a tether partner.
				</Trans>,
			}))
		}
	}

	private lsCastPercent(value: number, total: number): string {
		return ((value / total) * 100).toFixed(2) + '%'
	}
}
