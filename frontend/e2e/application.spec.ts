import { expect, test } from '@playwright/test'

test('dashboard, setup and history use the running backend', async ({
	page,
	request,
}) => {
	const errors: string[] = []
	page.on('pageerror', error => errors.push(error.message))
	const health = await request.get('/api/health')
	expect(health.ok()).toBeTruthy()
	await page.goto('/')
	await expect(
		page.getByRole('heading', { name: 'Make your next conversation count.' }),
	).toBeVisible()
	await page.screenshot({
		path: 'test-results/dashboard-desktop.png',
		fullPage: true,
	})
	await page.getByRole('button', { name: 'New training', exact: true }).click()
	await expect(
		page.getByRole('heading', { name: 'Set the scene. Start practicing.' }),
	).toBeVisible()
	await page.getByRole('button', { name: /Product comparison/ }).click()
	await page.getByRole('button', { name: /analytical/i }).click()
	await page.getByRole('button', { name: 'hard', exact: true }).click()
	await page.getByLabel('Conversation language').selectOption('ru')
	await page
		.getByLabel('What are you selling?')
		.fill(
			'CRM software with onboarding for small businesses, costing $100 per month.',
		)
	await page.screenshot({
		path: 'test-results/training-desktop.png',
		fullPage: true,
	})
	const created = await request.post('/api/sessions', {
		data: {
			language: 'ru',
			scenario: 'product_comparison',
			personality: 'analytical',
		},
	})
	expect(created.status()).toBe(201)
	const session = await created.json()
	await page.goto('/#/history')
	await expect(
		page.getByRole('heading', {
			name: 'Every session has something to teach.',
		}),
	).toBeVisible()
	await page
		.getByRole('button', { name: 'Open Product comparison report' })
		.first()
		.click()
	await expect(page.getByText('This session hasn’t started yet.')).toBeVisible()
	expect((await request.get(`/api/sessions/${session.id}`)).ok()).toBeTruthy()
	expect(errors).toEqual([])
})

test('mobile layout stays within the viewport and navigation works', async ({
	page,
}) => {
	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/')
	await expect(
		page.getByRole('heading', { name: 'Make your next conversation count.' }),
	).toBeVisible()
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390)
	await page.screenshot({
		path: 'test-results/dashboard-mobile.png',
		fullPage: true,
	})
	await page.getByRole('button', { name: 'Open navigation' }).click()
	await page.getByRole('link', { name: 'New training', exact: true }).click()
	await expect(page.getByLabel('What are you selling?')).toBeVisible()
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390)
	await page.screenshot({
		path: 'test-results/training-mobile.png',
		fullPage: true,
	})
})

test('microphone denial is recoverable and does not create a session', async ({
	page,
	request,
}) => {
	// Only readiness is mocked; no provider request or fake score is produced.
	await page.route('**/api/health', route =>
		route.fulfill({
			json: {
				status: 'ok',
				ai_ready: true,
				missing_configuration: [],
				max_session_seconds: 600,
			},
		}),
	)
	await page.addInitScript(() => {
		navigator.mediaDevices.getUserMedia = async () => {
			throw new DOMException('Denied for test', 'NotAllowedError')
		}
	})
	const before = (await (await request.get('/api/sessions')).json()).total
	await page.goto('/#/training')
	await page
		.getByRole('button', { name: 'Start training', exact: true })
		.click()
	await expect(page.getByRole('alert')).toContainText(
		'Microphone permission was denied',
	)
	await expect(
		page.getByRole('button', { name: 'Start training', exact: true }),
	).toBeEnabled()
	expect((await (await request.get('/api/sessions')).json()).total).toBe(before)
})

test('voice browser pipeline captures PCM, displays actual protocol turns, ends and renders the report', async ({
	page,
}) => {
	// Provider messages and report are explicit TEST fixtures, never part of application data.
	const timestamp = new Date().toISOString()
	const messages = [
		{
			id: 'test-customer',
			sequence: 1,
			speaker: 'customer',
			content:
				'Our team spends too long entering customer data. What can you do?',
			timestamp,
		},
		{
			id: 'test-sales',
			sequence: 2,
			speaker: 'salesperson',
			content:
				'We can automate your workflow. Which repetitive tasks take up most of your time today?',
			timestamp,
		},
	]
	const evidence = {
		feedback: 'Connected a benefit to the customer’s stated workflow concern.',
		turn_id: 'test-sales',
		quote: 'We can automate your workflow.',
	}
	const session = {
		id: 'browser-test',
		scenario: 'price_objection',
		personality: 'skeptical',
		difficulty: 'medium',
		language: 'en',
		product_description: 'CRM software subscription for small businesses.',
		created_at: timestamp,
		started_at: timestamp,
		ended_at: timestamp,
		duration_seconds: 65,
		status: 'evaluated',
		overall_score: 76,
		error: null,
		transcript_warning: null,
		messages,
		evaluation: {
			overall_score: 76,
			categories: {
				needs_discovery: 8,
				communication: 7,
				objection_handling: 6,
				value_proposition: 9,
				closing: 8,
			},
			strengths: [evidence],
			weaknesses: [
				{
					...evidence,
					feedback:
						'The proposed benefit could be more specific about the time saved.',
				},
			],
			recommendations: [
				'Ask which manual task is the biggest bottleneck.',
				'Confirm a concrete next step.',
			],
			summary:
				'You connected your product to a real customer need. Make the benefit more specific and confirm a useful next step.',
			created_at: timestamp,
		},
	}
	await page.route('**/api/health', route =>
		route.fulfill({
			json: {
				status: 'ok',
				ai_ready: true,
				missing_configuration: [],
				max_session_seconds: 600,
			},
		}),
	)
	await page.route('**/api/sessions', route =>
		route.fulfill({ status: 201, json: session }),
	)
	await page.route('**/api/sessions/browser-test', route =>
		route.fulfill({ json: session }),
	)
	await page.route('**/api/dashboard', route =>
		route.fulfill({
			json: {
				total_sessions: 0,
				average_score: null,
				total_duration_seconds: 0,
				improvement_percentage: null,
				evaluated_sessions: 0,
				skills: {},
				recent_sessions: [],
				trend: [],
			},
		}),
	)
	let pcmFrames = 0
	let paused = false
	await page.routeWebSocket('**/ws/training/browser-test', ws => {
		ws.send(
			JSON.stringify({
				type: 'connected',
				started_at: timestamp,
				input_sample_rate: 16000,
				output_sample_rate: 24000,
			}),
		)
		for (const message of messages)
			ws.send(JSON.stringify({ type: 'transcript', message }))
		ws.send(Buffer.alloc(4800))
		ws.onMessage(message => {
			if (typeof message !== 'string') {
				expect(message.length).toBeGreaterThan(0)
				expect(message.length).toBeLessThanOrEqual(3200)
				expect(message.length % 2).toBe(0)
				pcmFrames++
			} else {
				const control = JSON.parse(message)
				if (control.type === 'audio_pause') paused = true
				if (control.type === 'end')
					ws.send(JSON.stringify({ type: 'ended', session_id: 'browser-test' }))
			}
		})
	})
	const errors: string[] = []
	page.on('pageerror', e => errors.push(e.message))
	await page.addInitScript(() => {
		const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
		navigator.mediaDevices.getUserMedia = async constraints => {
			const stream = await capture(constraints)
			;(globalThis as unknown as { testStream: MediaStream }).testStream = stream
			return stream
		}
	})
	await page.goto('/#/training')
	await page
		.getByRole('button', { name: 'Start training', exact: true })
		.click()
	await expect(page.getByText('Your mic is on. Speak naturally.')).toBeVisible()
	await expect.poll(() => pcmFrames).toBeGreaterThan(0)
	await expect(page.getByText(messages[0].content)).toBeVisible()
	await page.getByRole('button', { name: 'Mute microphone' }).click()
	await expect.poll(() => paused).toBeTruthy()
	await expect(
		page.getByText('Microphone muted', { exact: true }),
	).toBeVisible()
	await page.getByRole('button', { name: 'Unmute microphone' }).click()
	await page.screenshot({
		path: 'test-results/live-session-test-fixture.png',
		fullPage: true,
	})
	await page.getByRole('button', { name: 'End session', exact: true }).click()
	await expect(page.getByText('YOUR OVERALL SCORE')).toBeVisible()
	await expect(page.getByText('76', { exact: true })).toBeVisible()
	await expect(page.getByText('A note from your AI coach')).toBeVisible()
	expect(await page.evaluate(() => (globalThis as unknown as { testStream: MediaStream }).testStream.getTracks().every(track => track.readyState === 'ended'))).toBeTruthy()
	await page.screenshot({
		path: 'test-results/report-test-fixture.png',
		fullPage: true,
	})
	await page.setViewportSize({ width: 390, height: 844 })
	expect(
		await page.evaluate(() => document.documentElement.scrollWidth),
	).toBeLessThanOrEqual(390)
	await page.screenshot({
		path: 'test-results/report-mobile-test-fixture.png',
		fullPage: true,
	})
	expect(errors).toEqual([])
})
