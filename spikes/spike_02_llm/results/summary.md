# Spike 2 — LLM Pipeline Evaluation Results

## Data

- Source: spike_01_ingest/results_api.jsonl
- Unique messages: 240
- Label set: 30 hand-labeled important moments
- Stream: automotive/car-deal negotiation (~16 msgs/min, ~10 min)

## Results Table

```
Run                         | Prompts | Calls/min | P50 ms  | P95 ms  | P99 ms  | Recall  | Precision
----------------------------+---------+-----------+---------+---------+---------+---------+-----------
A_90s_gpt-4o-mini           | 32      | 2         | 1840    | 2304    | 2584    | 1       | 1
A_60s_gpt-4o-mini           | 32      | 2         | 1765    | 2407    | 2410    | 1       | 0.906
A_60s_gpt-4o                | 32      | 2         | 1487    | 2006    | 2168    | 1       | 0.906
B_gpt-4o-mini               | 32      | 2         | 5327    | 9174    | 9831    | 1       | 0.906
B_gpt-4o                    | 32      | 2         | 5238    | 7308    | 8445    | 1       | 0.906
A_30s_gpt-4o-mini           | 32      | 2         | 2305    | 3775    | 3844    | 1       | 0.719
C_gpt-4-turbo               | 21      | 1.4       | 1381    | 2244    | 2602    | 0.967   | 1
C_gpt-4o-mini               | 21      | 1.4       | 669     | 873     | 974     | 0.967   | 1
C_gpt-4o                    | 21      | 1.4       | 757     | 1175    | 1236    | 0.967   | 1
```

## Missed Moments (best run: A_90s_gpt-4o-mini)

## Sample Prompts

### A_90s_gpt-4o-mini

[22:26:40] Several viewers are inquiring about a waitlist for car deals, indicating a potential demand for organized access to your
[22:26:40] A viewer is ready to spend $48k on a Murano but is frustrated with it being in the shop, suggesting a need for advice on
[22:26:40] Engage with the viewer who mentioned wanting a Murano to discuss their specific needs and possibly offer tailored option
[22:32:02] Address the question about whether the same strategy for negotiating applies to used cars as it does for new cars, as it
[22:32:02] Respond to the superchat from @nozachris1862 regarding the odds of a good discount on the new Kia k4 hatchback upon arri
[22:32:02] Engage with the viewer who mentioned preferring aftermarket products over factory add-ons, as this could resonate with o
[22:36:42] Respond to @wanton47's superchat about whether there will be more car deals today, as it's a key question from the audie
[22:36:42] Address the specific requests for discounts on the 2026 Toyota Tundra Limited and the 2026 F-250 XLT, as these are popul
[22:36:42] Acknowledge the viewer's positive experience with Delivrd, as it highlights the effectiveness of the service and may enc

### A_60s_gpt-4o-mini

[22:26:40] Several viewers are asking about a wait list for car deals, indicating high interest in securing vehicles.
[22:26:40] A viewer is ready to spend $48k on a Murano but is frustrated with it being in the shop, suggesting a need for reassuran
[22:26:40] Engage with the viewer who mentioned they want a Murano to discuss their specific needs and address their concerns direc
[22:32:02] Respond to @nozachris1862's superchat about the Kia K4 hatchback and discuss the likelihood of getting a good discount o
[22:32:02] Address the question about aftermarket products versus factory add-ons, as it seems to be a point of interest for viewer
[22:32:02] Engage with the comments regarding Nissan reliability, particularly the comparison between Murano and Rogue, as it may s
[22:36:42] Multiple viewers are asking for specific deals and discounts on various 2026 models, including the Toyota Tundra, Ford F
[22:36:42] A viewer shared a positive experience with Delivrd, highlighting the smoothness of their deal, which could be a good mom
[22:36:42] There's a growing interest in leasing options, with a viewer mentioning leasing every 3 years; consider addressing leasi

### A_60s_gpt-4o

[22:26:40] A viewer is interested in purchasing a Nissan Murano and is considering spending $48k, but they have concerns about reli
[22:32:02] A viewer, @nozachris1862, sent a $4.99 superchat asking about the odds of getting a good discount on a new Kia K4 hatchb
[22:32:02] A viewer is asking about opting out of factory add-ons in favor of aftermarket products like Lasfit.
[22:36:42] Multiple viewers are asking about discounts and best offers for specific 2026 car models, including a Toyota Tundra Limi
[22:36:42] A viewer is specifically looking for a 28% discount on a Suzuki Swift Premium Platinum Lux trim.
[22:36:42] There is a question about potential discounts on a Silverado 1500.

### B_gpt-4o-mini

[22:26:40] "I see there's interest in a wait list for car purchases; let me know if you want to be added to that!"
[22:26:40] "Don't forget to check out our Delivrd Community Discord for more buying tips and to connect with fellow car enthusiasts
[22:32:02] Tomi should address the Car Reliability Discussion by saying, "Let's dive into the reliability of different models; I wa
[22:32:02] Tomi should also tackle the Negotiation Tips by stating, "Remember, doing thorough research is key to getting the best d
[22:36:42] Address the Car Deal Offers cluster by saying, "Let's dive into the best offers for the 2026 Toyota Tundra Limited and o
[22:36:42] Acknowledge the Personal Experiences cluster by responding, "I appreciate your feedback on the smooth deals; if anyone e

### B_gpt-4o

[22:26:40] Address the Purchase Inquiry by asking the viewer if they need assistance with their Murano purchase or have questions a
[22:32:02] "Thank you @nozachris1862 for the $4.99! As for your question about the Kia K4 hatchback, it's often challenging to get
[22:32:02] "I see some of you are discussing aftermarket products versus factory add-ons. If you prefer aftermarket options like La
[22:36:42] "Let's dive into some of these car deal offers! For a 2026 Toyota Tundra Limited, a good starting point might be aiming

### A_30s_gpt-4o-mini

[22:26:40] Multiple viewers are asking about a wait list for car deals; consider addressing this to clarify your process.
[22:26:40] A viewer is ready to spend $48k on a Murano but is frustrated with it being in the shop; this could be an opportunity to
[22:26:40] Engage with "wantsNissan" to see if they need assistance or have specific questions about the Murano or other vehicles.
[22:32:02] Respond to @nozachris1862's superchat about the Kia K4 hatchback and discuss potential discounts when it arrives on the
[22:32:02] Address the comment about visiting the parts department for insights on which cars are good, as it may resonate with vie
[22:32:02] Consider explaining the principle-agent model mentioned in the chat, as it seems to be a topic of interest that could le
[22:36:42] Viewers are asking for specific deal information on the 2026 Ford F-250 XLT and leasing options every 3 years.
[22:36:42] There are multiple inquiries about discounts on the 2026 RAV4 XSE and the Silverado 1500.
[22:36:42] A viewer shared a positive experience with Delivrd, highlighting the smoothness of their deal process, which could be a

### C_gpt-4-turbo

[22:26:32] Tomi should acknowledge wantsNissan by saying, "Thanks for the shout-out, wantsNissan! Let's find you a great deal on th
[22:33:25] Acknowledge the comment and explain that you try to address as many viewers as possible, inviting more questions to ensu
[22:38:20] Tomi should acknowledge the repeated question by saying, "I see this question was asked twice; let me address that now."

### C_gpt-4o-mini

[22:26:32] Acknowledge the viewer and ask what specific features they want in a Murano.
[22:33:25] Acknowledge the comment and clarify that you aim to address everyone's questions fairly.
[22:38:20] Address the repeated question by explaining the situation and sharing your insights on dealership tactics.

### C_gpt-4o

[22:26:32] Acknowledge the viewer's interest in a Nissan Murano and ask for more details to help negotiate a deal.
[22:33:25] Acknowledge the comment and explain that you try to address as many questions as possible but can't get to everyone.
[22:38:20] Address the viewer's question about dealership sabotage and share any relevant experiences or advice.
