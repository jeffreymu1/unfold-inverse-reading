'use strict';

const chapters = [
  ['problem','The problem'], ['system','How it works'], ['happy-path','Happy path'],
  ['edge-context','Edge case: two passages'], ['edge-pace','Edge case: pace'],
  ['edge-revision','Edge case: revision'],
  ['limitations','Limitations'], ['references','References']
];
const page = document.getElementById('page');
const siteStatus = document.getElementById('site-status');
let pageIndex = 0;
let sceneIndex = 0;
let reader = null;
let revealTimer = null;
let burstTimer = null;
let burstLoopTimer = null;
let pendingSelection = null;
let happyStep = 0;
let happyState = {selection:null,turns:[],sourceVisible:false};
let paceMode = 'guided';
let failureView = 'simplified';
const availablePages = chapters.length;
const originalRevisionSentence = 'The story explicitly states that coffee transferred onto the essay.';
const revisedSentence = 'The reader infers that coffee transferred onto the essay.';
const earlierRevisionTurns = [{question:'What does “explicitly states” mean here?',answer:'It means the candidate answer treats the coffee transfer as a fact directly reported in the story.'}];
const revisionState = {
  step:0,
  deleted:false,
  turns:[]
};
const focusSentenceIndex = 5;
const story = "Ditto, Eleanor, and Will were handling different tasks in Will's office. Ditto graded an essay with a red marker on the couch, Will made lecture slides at the desk, and Eleanor watered the plants next to him. He spilled black coffee on the laptop, and the keyboard got sticky. Eleanor noticed the mess. She opened the drawer, but the paper towels ran out. Ditto used the graded essay it had been working on to dab at the spill. Later, Jinho came by to collect the graded essay to return it to the student. He noticed there were stains on the essay.";
const escapeHtml = text => String(text).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const announce = text => { siteStatus.textContent = text; };

// Candidate answers are authored examples; source references point to the supplied Chapter 9.
const answerParts = [
  {title:'Who spilled the coffee?', sentences:[
    'Will is the most plausible person who spilled the coffee: the reader resolves “him” in “next to him” as Will at the desk, then carries that referent into “He spilled black coffee.”',
    'This is pronominal anaphora, supported by the discourse and office context; it is not a rule that a pronoun must refer to the nearest name.'
  ]},
  {title:'Using the office context', sentences:[
    'The reader also builds a situation model with Ditto on the couch, Will at the desk, Eleanor nearby, and the laptop involved in the spill.',
    'Chapter 9 distinguishes that model of people, objects, locations, and events from the surface wording, which helps explain why context matters when deciding who “He” refers to.'
  ]},
  {title:'How the stains are connected', sentences:[
    'For the stain colors, the reader tracks the same graded essay from Ditto’s grading, through dabbing the spill, to Jinho’s collection, and resolves the final “He” as Jinho.',
    'That causal link requires a bridging inference: the reader connects the later stains to the earlier cleanup by supplying the unstated transfer of black coffee onto the essay.'
  ]},
  {title:'What color can we claim?', sentences:[
    'The red marker supports expecting red grading marks, but the story does not explicitly say that those marks are the stains Jinho notices.',
    'A careful candidate answer distinguishes likely black coffee stains from red grading marks; the exact final stain colors are inferred rather than directly reported.'
  ]}
];
// This candidate deliberately includes an overclaim for the comparison edge case.
const comparisonParts = [
  {sentences:['The stains on the essay are black and red.']},
  {sentences:['To identify who spilled the coffee, the reader resolves “him” as Will at the desk, then carries that referent into “He spilled black coffee.”']},
  {sentences:['The office context places Will at the desk, Eleanor beside him, and Ditto on the couch with the graded essay. These people, objects, and locations contribute to a situation model.']},
  {sentences:['The reader tracks the same essay through grading, dabbing the spill, and Jinho’s collection. The final “He” refers to Jinho rather than Will.']},
  {sentences:['Connecting the spill to the later stains requires a causal bridging inference: the reader supplies the unstated transfer of coffee onto the paper.']},
  {sentences:['The story does not establish the exact colors of the stains Jinho notices; black coffee stains are plausible, while red grading marks are not necessarily the stains he means.']}
];
const allSentences = answerParts.flatMap((part,partIndex) => part.sentences.map(text => ({text,partIndex})));
const tokens = text => text.match(/\S+\s*/g) || [];
const totalWords = allSentences.reduce((sum,sentence) => sum + tokens(sentence.text).length,0);
const totalCharacters = allSentences.reduce((sum,sentence)=>sum+sentence.text.length,0);
const sourceNote = `<div class="source-excerpt" data-source-note hidden><span class="source-label">Rayner et al., Chapter 9 · “Bridging inferences,” pp. 263–264</span><blockquote>“A bridging inference is made when something has to be added to the discourse model to tie a new proposition into the previous model.”</blockquote><p>The chapter also explains that these inferences can connect causes and goals. Applying that idea here, the reader supplies the transfer of coffee onto the essay. The chapter does not itself analyze the office story.</p><a href="rayner_ch9.pdf#page=19" target="_blank" rel="noopener">Read the chapter passage</a></div>`;

function heading(kicker,title,intro) {
  return `<div class="page-heading"><div class="eyebrow">${kicker}</div><h1>${title}</h1>${intro?`<p class="page-intro">${intro}</p>`:''}</div>`;
}
function browserShell(content) {
  return `<div class="browser-window"><div class="browser-toolbar"><span class="window-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="address-bar">unfold / reading workspace</span></div>${content}</div>`;
}
function readerShell({mode='paced',complete=false,empty=false,local=false,dependency=false,source=false}={}) {
  const paced=mode==='paced';
  return browserShell(`<div class="reader-body"><div class="reader-main"><div class="reader-question"><div class="message-role">User</div><p>Using Chapter 9, explain the inferences needed to answer: Who spilled the coffee? What colors were the stains on the essay?</p><div class="reader-context"><div class="context-heading">Context</div><details class="story-text"><summary>The office story</summary><p>${escapeHtml(story)}</p></details><a class="chapter-link" href="rayner_ch9.pdf" target="_blank" rel="noopener">Chapter 9: Comprehension of Discourse</a></div></div>
      <div class="answer-label"><span>LLM</span><span class="sr-only" data-word-count>${complete?totalWords:0} / ${totalWords} words</span></div>
      ${dependency?'<div class="dependency">“That causal link” refers to earlier events. <button type="button" data-dependency aria-expanded="false">Show the earlier events</button><div class="dependency-detail" hidden>Ditto uses the same graded essay to dab at the coffee spill. Later, Jinho notices stains on it. The reader supplies a connection between the cleanup and those stains.</div></div>':''}
      <div class="answer-body" id="answer-body" aria-label="Candidate answer" ${empty?'hidden':''}></div>
      <div class="reader-empty" ${empty?'':'hidden'}><span class="waiting-dots" aria-label="Waiting for an answer">···</span></div>
      <div id="local-panel-host"></div>
      <div class="answer-actions" ${empty||!paced?'hidden':''}>
        ${paced?'<button class="button button-blue button-small" type="button" data-play>Start reveal</button><button class="button button-small" type="button" data-reset>Restart</button><button class="button button-small" type="button" data-show-all>Show full answer</button>':''}
      </div>
      <div class="sr-only" role="status" data-reader-status></div>
      ${source?sourceNote:''}
    </div></div>
    ${paced&&!empty?'<div class="pace-control"><label for="pace">Reading speed</label><input id="pace" type="range" min="120" max="600" step="30" value="240"><output for="pace" class="pace-output">≈ 240 words/min</output></div>':''}`);
}

function problemPage() {
  return `<div class="page-heading"><h1>Problem statement</h1></div><div class="problem-writeup"><p>The problem I’m targeting is the volume of text in an LLM’s answer, the additional reading created by clarification requests, and the difficulty of keeping those clarifications connected to the passages they explain. As I’ve mentioned in A), when prompting the LLM to generate a summary answer, the candidate answer becomes another text I have to understand alongside the chapter. A single response can introduce several concepts and reasoning steps before I have worked through the first, and it becomes a recursive process almost, where I need to descend down a huge explanation to resolve that, etc. etc. until I can pop back up and finish resolving the first thing I started with. This process is highly confusing, and makes it difficult to isolate the specific gap in my understanding, so I would like a tool that allows me to better process information and ask about it as questions come up.</p><p>The linear chat interface compounds this problem by placing follow-up explanations below the original answer. To ask about a particular phrase, I have to quote it or describe its location; afterward, I have to move between the clarification, the original sentence, and the relevant chapter passage. Working around this requires repeated copying, scrolling, and rereading to reconstruct the connection between them. I believe that although understanding the chapter and evaluating the LLM’s reasoning are fundamental parts of inverse reading, managing an expanding conversation and repeatedly reestablishing what each question refers to adds incidental complexity that consumes attention that could otherwise go toward checking the answer, or understanding the material better.</p></div>`;
}

const scenes = [
  {label:'start',title:'Start with a question.',options:{mode:'plain',empty:true}},
  {label:'too much text...',title:'The answer arrives faster than the reader can work through it.',options:{mode:'burst'}},
  {label:'paced reveal!',title:'Let the user choose the speed.',options:{mode:'paced'}},
  {label:'long follow-up...',title:'A question about one phrase produces another long answer.',options:{mode:'plain',complete:true}},
  {label:'ask in place!',title:'Ask from the passage you want to understand.',options:{mode:'plain',complete:true,local:true}},
  {label:'both together',title:'Use pacing and local clarification together.',options:{mode:'paced',local:true}}
];
function systemPage() {
  return `<div class="page-heading"><h1>How it works</h1></div><div class="timeline" aria-label="Interface demonstration timeline"><div class="timeline-inner"><div class="timeline-slider"><label class="sr-only" for="scene-position">Walkthrough position</label><input id="scene-position" type="range" min="0" max="5" step="1" value="${sceneIndex}" aria-valuetext="${scenes[sceneIndex].label}"></div><div class="timeline-labels">${scenes.map((scene,i)=>`<button class="timeline-point" type="button" data-scene="${i}" aria-pressed="${i===sceneIndex}"><span class="timeline-dot" aria-hidden="true"></span>${scene.label}</button>`).join('')}</div></div></div><div id="system-scene">${systemSceneMarkup()}</div>`;
}
function systemSceneMarkup(){const scene=scenes[sceneIndex];return `<div class="scene-summary"><h2>${scene.title}</h2></div>${readerShell(scene.options)}`;}
function initializeSystemScene(){
  initReader(scenes[sceneIndex].options);
  if(sceneIndex===1)startBurstLoop();
  if(sceneIndex===3)showConventionalFollowup();
}
function setScene(index){
  if(index<0||index>=scenes.length||index===sceneIndex)return;
  stopReveal();stopBurst();hideSelectionMenu();sceneIndex=index;
  page.querySelector('#system-scene').innerHTML=systemSceneMarkup();
  const slider=page.querySelector('#scene-position');slider.value=index;slider.setAttribute('aria-valuetext',scenes[index].label);
  page.querySelectorAll('[data-scene]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.scene)===index)));
  initializeSystemScene();announce(scenes[index].label);
}

const happySteps = [
  {title:'Read',description:'Start the answer at your chosen speed.'},
  {title:'Pause',description:'The phrase “causal bridging inference” is unclear. Stop the main answer before adding another explanation.'},
  {title:'Ask here',description:'In the module, enter “What is a causal bridging inference?” and choose Ask.'},
  {title:'Check the source',description:'Choose “Show the source” to compare the reply with Chapter 9.'},
  {title:'Return & decide',description:'Close the module and return to the original answer. The note remains at its sentence; the reader makes the final judgment.'}
];
function happyPage() {
  const step=happySteps[happyStep];
  const instruction=happyStep===3&&!happyState.turns.length?'Ask your question first, then choose “Show the source” to compare the reply with Chapter 9.':step.description;
  return heading('03 / HAPPY PATH','From “what does that mean?”<br><span class="accent">back to the argument.</span>','')+
    `<div class="flow-list" aria-label="Happy path steps">${happySteps.map((item,i)=>`<button class="flow-step ${i===happyStep?'active':''}" type="button" data-happy-step="${i}" aria-pressed="${i===happyStep}"><span>0${i+1}</span>${item.title}</button>`).join('')}</div>
    <div class="scene-summary"><div><h2>${step.title}</h2><p>${instruction}</p></div><div class="scene-arrows"><button class="button button-small" type="button" data-happy-step="${happyStep-1}" ${happyStep===0?'disabled':''}>Back a step</button><button class="button button-small button-dark" type="button" data-happy-step="${happyStep+1}" ${happyStep===4?'disabled':''}>Next step</button></div></div>
    ${readerShell({complete:happyStep===4,local:true,source:true})}
    ${happyStep===4?'<div class="verdict"><span>Your judgment of the stain-color explanation:</span><button class="button button-small" type="button" data-verdict="Supported as an inference">Supported as an inference</button><button class="button button-small" type="button" data-verdict="Needs qualification">Needs qualification</button><button class="button button-small" type="button" data-verdict="Still unresolved">Still unresolved</button><p class="verdict-status" role="status"></p></div>':''}`;
}
function contextPage() {
  return heading('04 / EDGE CASE 01','One question concerns two distant passages.','The reader sees a claim near the beginning and an apparently contradictory claim several paragraphs later. They select the later claim and ask, “Doesn’t this contradict what you said earlier?” A conversation attached to only that passage misses the comparison.')+
    readerShell({mode:'plain',complete:true,local:true});
}
function pacePage() {
  return heading('05 / EDGE CASE 02','Reading speed changes.','The same reader may skim familiar material, then stop at a difficult assumption. A fixed reveal rate can become either a delay or another source of overload.')+
    `<div class="edge-comparison" aria-label="Reading pace examples"><button class="edge-choice" type="button" data-pace-mode="guided" aria-pressed="${paceMode==='guided'}">Difficult passage · 120 words/min</button><button class="edge-choice" type="button" data-pace-mode="review" aria-pressed="${paceMode==='review'}">Familiar material · full answer</button></div>
    <div class="scenario-note"><span>Instructions</span>${paceMode==='guided'?'Start slowly. Adjust the slider mid-reveal, pause for a question, or show the full answer.':'Read the full answer. Highlight a passage to ask about it, or restart at a slower pace.'}</div>
    ${readerShell({complete:paceMode==='review',local:true,source:true})}`;
}
function revisionPage() {
  return heading('06 / EDGE CASE 03','Revising a sentence.','After checking the chapter, the reader corrects “explicitly states” to “infers.” The existing clarification must keep the wording it originally explained.')+
    '<div id="revision-workspace"></div>';
}
function revisionDiscussion(quote,turns,label) {
  return `<section class="clarification-panel" aria-label="${escapeHtml(label)}"><div class="clarification-heading"><span>${escapeHtml(label)}</span></div><blockquote class="selected-quote">${escapeHtml(quote)}</blockquote><div class="local-conversation">${turns.map(localTurnMarkup).join('')}</div></section>`;
}
function renderRevisionWorkspace() {
  const workspace=document.getElementById('revision-workspace');
  const earlier=revisionDiscussion(originalRevisionSentence,earlierRevisionTurns,'Based on earlier wording');
  if(revisionState.deleted){
    workspace.innerHTML=browserShell(`<div class="reader-main"><h2>Sentence deleted</h2><p class="revision-instruction">Its clarification stays with the earlier text. It is not moved to another sentence.</p><details class="revision-history"><summary>View the original sentence and its clarification</summary>${earlier}</details>${revisionState.turns.length?`<details class="revision-history"><summary>View the revised sentence and its clarification</summary>${revisionDiscussion(revisedSentence,revisionState.turns,'Based on earlier wording')}</details>`:''}<div class="answer-actions"><button class="button button-small" type="button" data-revision="restart">Start over</button></div></div>`);
    return;
  }
  const steps=['Original','Revise','Ask again'];
  const instructions=[
    'This clarification explains the original sentence.',
    'The sentence changed. The old clarification still explains the earlier claim.',
    'Ask a new question about the corrected sentence.'
  ];
  const sentence=revisionState.step===0?originalRevisionSentence:revisedSentence;
  const highlighted=revisionState.step===0?'explicitly states':'infers';
  const sentenceMarkup=escapeHtml(sentence).replace(highlighted,`<mark class="selection-highlight">${highlighted}</mark>`);
  let discussion;
  if(revisionState.step===0){
    discussion=revisionDiscussion(originalRevisionSentence,earlierRevisionTurns,'Attached clarification');
  }else if(revisionState.step===1){
    discussion=earlier;
  }else{
    discussion=`<section class="clarification-panel" aria-label="Clarification for revised sentence"><div class="clarification-heading"><span>Ask about the revised sentence</span></div><blockquote class="selected-quote">${escapeHtml(revisedSentence)}</blockquote><div class="local-conversation">${revisionState.turns.map(localTurnMarkup).join('')}</div><form class="question-form" data-revision-question><label class="sr-only" for="revision-question">Question about the revised sentence</label><input id="revision-question" maxlength="300" placeholder="Why is this an inference?" required><button class="button button-blue button-small" type="submit">Ask</button></form></section><details class="revision-history"><summary>View the earlier sentence and clarification</summary>${earlier}</details>`;
  }
  workspace.innerHTML=`<div class="flow-list revision-steps" aria-label="Revision example steps">${steps.map((label,index)=>`<button class="flow-step ${revisionState.step===index?'active':''}" type="button" data-revision-step="${index}" aria-pressed="${revisionState.step===index}"><span>0${index+1}</span>${label}</button>`).join('')}</div><p class="revision-instruction">${instructions[revisionState.step]}</p>${browserShell(`<div class="reader-main"><div class="answer-label">${revisionState.step===0?'Original sentence':'Revised sentence'}</div><p class="revision-sentence" id="revision-passage">${sentenceMarkup}</p>${discussion}${revisionState.step>0?'<details class="revision-deletion"><summary>If the sentence is deleted</summary><button class="button button-small" type="button" data-revision="delete">Delete this sentence</button></details>':''}</div>`)}`;
}
function initRevisionPage() {
  const workspace=document.getElementById('revision-workspace');
  workspace.addEventListener('click',event=>{
    const step=event.target.closest('[data-revision-step]');
    if(step){revisionState.step=Number(step.dataset.revisionStep);renderRevisionWorkspace();workspace.querySelector(`[data-revision-step="${revisionState.step}"]`).focus({preventScroll:true});return;}
    const button=event.target.closest('[data-revision]');if(!button)return;
    if(button.dataset.revision==='delete'){
      revisionState.deleted=true;announce('Sentence deleted. Its discussions remain with their original text.');
    }else if(button.dataset.revision==='restart'){
      revisionState.step=0;revisionState.deleted=false;revisionState.turns=[];
    }
    renderRevisionWorkspace();
  });
  workspace.addEventListener('submit',event=>{
    if(!event.target.matches('[data-revision-question]'))return;
    event.preventDefault();const question=workspace.querySelector('#revision-question').value.trim();if(!question)return;
    revisionState.turns.push({question,answer:'Here the LLM would answer based on the revised sentence. For example: the reader infers coffee transfer by connecting the cleanup with the later stains. The story does not directly report that transfer.'});
    renderRevisionWorkspace();workspace.querySelector('#revision-question').focus({preventScroll:true});
  });
  renderRevisionWorkspace();
}
function failurePage() {
  const checked=failureView==='original';
  return heading('07 / LIMITATION','Becoming more confident in a wrong answer.','A clear local reply may reinforce an incorrect answer before the reader checks it. Because the discussion stays focused on one passage, later questions may keep refining that explanation instead of challenging the broader answer.')+
    browserShell(`<div class="failure-main"><div class="answer-label">Original LLM answer</div><p class="failure-claim">“The red marker supports expecting red grading marks, but the story does not explicitly say that those marks are the stains Jinho notices.”</p><section class="clarification-panel"><div class="clarification-heading"><span>${checked?'Qualification restored':'A misleading local reply'}</span></div><div class="failure-question"><div class="message-role">User</div><p>Are both stain colors certain?</p></div><div class="failure-answer"><div class="message-role">LLM</div><p>${checked?'Black coffee stains are plausible. The red marker suggests red grading marks, but the story does not identify them as the stains Jinho sees. The exact final colors remain inferred.':'Yes. The stains are definitely red and black; the story states both colors.'}</p></div></section><div class="answer-actions"><button class="button button-blue button-small" type="button" data-failure="original" ${checked?'disabled':''}>Check the qualification</button>${checked?'<button class="button button-small" type="button" data-failure="simplified">Show the misleading reply</button>':''}</div></div>`)+
    `<p class="limitation-explanation">${checked?'Checking the qualification reveals the gap: red grading marks need not be the stains Jinho notices. The reader still needs to evaluate the answer against the story and chapter.':'The reply makes the colors seem settled, so the reader may move on without checking the story. A follow-up such as “Why red?” stays within the local explanation and may leave the larger question—whether the stain-color answer is justified—unchallenged.'}</p><p class="limitation-recovery"><strong>Recovery:</strong> keep the full answer and source available, and let the reader question the overall answer. Resolving one phrase should not be treated as confirmation of the whole interpretation.</p>`;
}
function referencesPage() {
  return `<div class="page-heading"><h1>References</h1></div>
    <div class="references">
      <div class="reference-item"><a href="rayner_ch9.pdf" target="_blank" rel="noopener">Rayner et al.<br>Chapter 9</a><span><strong>Comprehension of Discourse.</strong> Pronominal anaphora (pp. 253–254), bridging inferences (pp. 263–264), situation models (p. 269), and the limits of reading speed as a comprehension measure (pp. 272–274) inform the examples and pacing limitation.</span></div>
      <div class="reference-item"><a href="https://onlinelibrary.wiley.com/doi/10.1002/acp.1345" target="_blank" rel="noopener noreferrer">Hasler et al. · 2007</a><span><strong>Learner control in instructional animation.</strong> Motivates reader-controlled pacing. Applying findings about animation to LLM text remains a design hypothesis.</span></div>
      <div class="reference-item"><a href="https://scholarphi.org/" target="_blank" rel="noopener noreferrer">ScholarPhi · 2021</a><span><strong>Contextual definitions in scientific papers.</strong> Motivates keeping an explanation beside the passage that needs it.</span></div>
      <div class="reference-item"><a href="https://archives.iw3c2.org/www2002/presentations/bouvin.pdf" target="_blank" rel="noopener noreferrer">Fluid Annotations<br>2002</a><span><strong>Fluid Annotations through Open Hypermedia.</strong> Provides earlier work on annotations embedded in the reading surface, keeping the main text and its explanation connected.</span></div>
      <div class="reference-item"><a href="https://sanghosuh.github.io/papers/sensecape_uist.pdf" target="_blank" rel="noopener noreferrer">Sensecape · 2023</a><span><strong>Managing LLM information at multiple levels of abstraction.</strong> Informs the treatment of expanding explanations. This demo keeps follow-ups in one local module.</span></div>
      <div class="reference-item"><a href="https://mahdikhadem.com/projects/project-7/" target="_blank" rel="noopener noreferrer">SnapExplain</a><span><strong>Selection-specific LLM explanations.</strong> Provides related work on asking about highlighted text through a local popup.</span></div>
      <div class="reference-item"><a href="https://endurable-diamond-2fc.notion.site/Assignment-2-Inverse-Reading-3e0ef3d12c9580328c9be33d336b2317" target="_blank" rel="noopener noreferrer">Assignment 2<br>Inverse Reading</a><span>The office story and questions provide the task context: inspect a candidate answer, connect it to Chapter 9, and refine or correct its reasoning.</span></div>
    </div><p class="implementation-credit">Implemented with Codex.</p>`;
}

function renderPage({focus=false}={}) {
  stopReveal();stopBurst();hideSelectionMenu();reader=null;
  document.getElementById('chapters').innerHTML=chapters.map(([slug,title],i)=>`<button class="chapter" type="button" data-go="${i}" ${i===pageIndex?'aria-current="step"':''} ${i>=availablePages?'disabled':''}><span class="chapter-number">0${i+1}</span>${title}</button>`).join('');
  const pageRenderers=[problemPage,systemPage,happyPage,contextPage,pacePage,revisionPage,failurePage,referencesPage];
  page.innerHTML=`<div class="page-content">${pageRenderers[pageIndex]()}</div>`;
  document.getElementById('page-number').textContent=`0${pageIndex+1} / 0${availablePages}`;
  document.getElementById('page-name').textContent=chapters[pageIndex][1];
  document.getElementById('previous-page').disabled=pageIndex===0;
  document.getElementById('next-page').disabled=pageIndex===availablePages-1;
  document.getElementById('next-page').textContent=pageIndex===availablePages-1?'End of walkthrough':'Next page';
  document.title=`${chapters[pageIndex][1]} — Unfold`;
  if(pageIndex===1)initializeSystemScene();
  if(pageIndex===2) {
    const throughFocusedSentence=allSentences.slice(0,focusSentenceIndex+1).reduce((sum,sentence)=>sum+sentence.text.length,0);
    initReader({complete:happyStep===4,local:true,initialCharacters:happyStep>0?throughFocusedSentence:0});
    if(happyState.selection&&happyState.turns.length)reader.markers.set(happyState.selection.sentenceIndex,{...happyState.selection,turns:happyState.turns.map(turn=>({...turn}))});
    if(happyStep>=2&&happyStep<=3){
      openLocalPanel(happyState.selection||{text:'bridging inference',sentenceIndex:focusSentenceIndex});
      if(happyStep===2)page.querySelector('#local-question').placeholder='What is a causal bridging inference?';
    }
    if(happyStep===4)renderAnswer();
    page.querySelector('[data-source-note]').hidden=!happyState.sourceVisible;
  }
  if(pageIndex===3){
    initReader({complete:true,local:true,parts:comparisonParts});
    openLocalPanel({text:comparisonParts[5].sentences[0],sentenceIndex:5});
    askLocal('Doesn’t this contradict what you said earlier?');
  }
  if(pageIndex===4)initReader({complete:paceMode==='review',local:true,wpm:paceMode==='guided'?120:360});
  if(pageIndex===5)initRevisionPage();
  if(focus) {page.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});announce(`Page ${pageIndex+1}: ${chapters[pageIndex][1]}`);}
}
function goPage(index) {
  if(index<0||index>=availablePages)return;
  pageIndex=index;history.replaceState(null,'',`#${chapters[index][0]}`);renderPage({focus:true});
}
function stopReveal() {clearTimeout(revealTimer);revealTimer=null;if(reader)reader.playing=false;}
function stopBurst(){clearTimeout(burstTimer);clearTimeout(burstLoopTimer);burstTimer=null;burstLoopTimer=null;}
function startBurstLoop(){
  stopBurst();
  if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){reader.visible=totalCharacters;renderAnswer();return;}
  function burst(){
    if(pageIndex!==1||sceneIndex!==1||document.hidden)return;
    reader.visible=0;renderAnswer();
    burstLoopTimer=setTimeout(burst,8000);
    function tick(){
      if(pageIndex!==1||sceneIndex!==1)return;
      reader.visible=Math.min(reader.visible+140,totalCharacters);renderAnswer();
      if(reader.visible<totalCharacters)burstTimer=setTimeout(tick,22);
    }
    burstTimer=setTimeout(tick,180);
  }
  burst();
}
function initReader(options) {
  const parts=options.parts||answerParts;
  const sentences=parts.flatMap(part=>part.sentences);
  const characterCount=sentences.reduce((sum,text)=>sum+text.length,0);
  const wordCount=sentences.reduce((sum,text)=>sum+tokens(text).length,0);
  let paragraphEnd=0;
  const paragraphEnds=new Set(parts.slice(0,-1).map(part=>{paragraphEnd+=part.sentences.reduce((sum,text)=>sum+text.length,0);return paragraphEnd;}));
  reader={...options,parts,characterCount,wordCount,charactersPerWord:characterCount/wordCount,paragraphEnds,visible:options.complete?characterCount:options.initialCharacters||0,wpm:options.wpm||240,playing:false,markers:new Map(),selection:null,secondary:null,attaching:false,turns:[],previousFocus:null};
  renderAnswer();updateReaderControls();
  const pace=page.querySelector('#pace');if(pace){pace.value=reader.wpm;pace.setAttribute('aria-valuetext',`Approximately ${reader.wpm} words per minute`);page.querySelector('.pace-output').textContent=`≈ ${reader.wpm} words/min`;}
  page.querySelector('[data-play]')?.addEventListener('click',toggleReveal);
  page.querySelector('[data-reset]')?.addEventListener('click',()=>{stopReveal();reader.visible=0;closeLocalPanel(false);reader.markers.clear();if(pageIndex===2){happyState={selection:null,turns:[],sourceVisible:false};page.querySelector('[data-source-note]').hidden=true;}renderAnswer();updateReaderControls();setReaderStatus('Ready to reveal at your chosen pace.');});
  page.querySelector('[data-show-all]')?.addEventListener('click',()=>{stopReveal();reader.visible=reader.characterCount;renderAnswer();updateReaderControls();setReaderStatus('The full original answer is visible.');});
  page.querySelector('#pace')?.addEventListener('input',event=>{reader.wpm=Number(event.target.value);event.target.setAttribute('aria-valuetext',`Approximately ${reader.wpm} words per minute`);page.querySelector('.pace-output').textContent=`≈ ${reader.wpm} words/min`;if(reader.playing){clearTimeout(revealTimer);scheduleReveal();}});
  page.querySelector('[data-dependency]')?.addEventListener('click',event=>{const detail=page.querySelector('.dependency-detail');detail.hidden=!detail.hidden;event.target.textContent=detail.hidden?'Show the earlier events':'Hide the earlier events';event.target.setAttribute('aria-expanded',String(!detail.hidden));});
  const body=page.querySelector('#answer-body');
  body?.addEventListener('pointerdown',event=>{if(reader?.playing&&!event.target.closest('#local-panel-host')){stopReveal();body.querySelector('.reveal-cursor')?.remove();updateReaderControls();setReaderStatus('Paused while you select or inspect the answer.');}});
  body?.addEventListener('contextmenu',event=>{
    if(!reader.local||event.target.closest('#local-panel-host'))return;
    const selection=getAnswerSelection();
    if(!selection)return;
    event.preventDefault();showSelectionMenu(selection,event.clientX,event.clientY);
  });
  body?.addEventListener('mouseup',()=>{
    if(!reader.local)return;
    const selection=getAnswerSelection();
    if(!selection)return;
    const rect=window.getSelection().getRangeAt(0).getBoundingClientRect();
    showSelectionMenu(selection,rect.left,rect.bottom+8);
  });
  // Saved notes reopen their original highlighted passage.
  body?.addEventListener('click',event=>{
    const marker=event.target.closest('[data-anchor]');if(marker){openLocalPanel({...reader.markers.get(Number(marker.dataset.anchor)),sentenceIndex:Number(marker.dataset.anchor)});}
  });
}
function renderAnswer() {
  const body=page.querySelector('#answer-body');if(!body||!reader)return;
  // Keep the local module alive while moving it with its selected paragraph.
  const panelHost=page.querySelector('#local-panel-host');if(panelHost&&body.contains(panelHost))body.after(panelHost);
  let remaining=reader.visible;let globalIndex=0;let visibleWords=0;
  body.innerHTML=reader.parts.map(part=>{
    const visibleSentences=part.sentences.map(text=>{
      const sentenceIndex=globalIndex++;const shown=text.slice(0,Math.max(0,remaining));remaining-=text.length;visibleWords+=tokens(shown).length;
      if(!shown)return '';
      const complete=shown===text;
      const marker=complete&&reader.markers.has(sentenceIndex)?`<button class="anchor-marker" type="button" data-anchor="${sentenceIndex}" aria-label="Reopen clarification for sentence ${sentenceIndex+1}">note</button>`:'';
      let sentenceHtml=escapeHtml(shown);
      const selection=[reader.selection,reader.secondary].find(selection=>selection?.sentenceIndex===sentenceIndex||selection?.ranges?.some(range=>range.sentenceIndex===sentenceIndex));
      const selectedRange=selection?.ranges?.find(range=>range.sentenceIndex===sentenceIndex);
      if(selectedRange){
        sentenceHtml=`${escapeHtml(shown.slice(0,selectedRange.start))}<mark class="selection-highlight">${escapeHtml(shown.slice(selectedRange.start,selectedRange.end))}</mark>${escapeHtml(shown.slice(selectedRange.end))}`;
      }else if(selection?.sentenceIndex===sentenceIndex){
        const selected=selection.text;const start=shown.indexOf(selected);
        if(start>=0)sentenceHtml=`${escapeHtml(shown.slice(0,start))}<mark class="selection-highlight">${escapeHtml(selected)}</mark>${escapeHtml(shown.slice(start+selected.length))}`;
      }
      return `<span class="answer-sentence" id="passage-${sentenceIndex}" data-sentence="${sentenceIndex}" tabindex="-1">${sentenceHtml}</span>${marker} `;
    }).join('');
    return visibleSentences.trim()?`<p>${visibleSentences}</p>`:'';
  }).join('');
  if(reader.playing&&reader.visible<reader.characterCount)(body.lastElementChild||body).insertAdjacentHTML('beforeend','<span class="reveal-cursor" aria-hidden="true"></span>');
  if(reader.selection&&panelHost)body.querySelector(`[data-sentence="${reader.selection.sentenceIndex}"]`)?.closest('p').after(panelHost);
  page.querySelector('[data-word-count]').textContent=`${visibleWords} / ${reader.wordCount} words`;
  body.dataset.visibleCharacters=reader.visible;
}
function setReaderStatus(text){const status=page.querySelector('[data-reader-status]');if(status)status.textContent=text;}
function updateReaderControls() {
  const play=page.querySelector('[data-play]');if(!play||!reader)return;
  play.textContent=reader.playing?'Pause':reader.visible>=reader.characterCount?'Reveal complete':reader.visible===0?'Start reveal':'Resume';
  play.disabled=reader.visible>=reader.characterCount;
}
function toggleReveal() {
  if(!reader||reader.visible>=reader.characterCount)return;
  if(reader.playing){stopReveal();setReaderStatus('Paused. Take the time you need.');}
  else{reader.playing=true;setReaderStatus('Revealing at your chosen pace. Pause at any time.');scheduleReveal();}
  renderAnswer();updateReaderControls();
}
function scheduleReveal() {
  const delay=60000/(reader.wpm*reader.charactersPerWord);
  revealTimer=setTimeout(()=>{
    if(!reader?.playing)return;
    reader.visible=Math.min(reader.visible+1,reader.characterCount);renderAnswer();
    if(reader.visible>=reader.characterCount){stopReveal();updateReaderControls();setReaderStatus('The full answer is visible.');}
    else if(reader.paragraphEnds.has(reader.visible))revealTimer=setTimeout(scheduleReveal,3000);
    else scheduleReveal();
  },delay);
}
function getAnswerSelection() {
  const selection=window.getSelection();const body=page.querySelector('#answer-body');
  if(selection&&selection.rangeCount&&selection.toString().trim()){
    const range=selection.getRangeAt(0);if(!body.contains(range.commonAncestorContainer))return null;
    const anchor=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
    const end=range.endContainer.nodeType===Node.ELEMENT_NODE?range.endContainer:range.endContainer.parentElement;
    if(anchor.closest('#local-panel-host')||end.closest('#local-panel-host'))return null;
    const text=selection.toString().trim();if(text.length>600){setReaderStatus('That selection is long. Select a sentence or a shorter passage for a focused clarification.');return null;}
    const ranges=[...body.querySelectorAll('[data-sentence]')].filter(sentence=>range.intersectsNode(sentence)).map(sentence=>{
      let start=0,end=sentence.textContent.length;
      if(sentence.contains(range.startContainer)){const before=range.cloneRange();before.selectNodeContents(sentence);before.setEnd(range.startContainer,range.startOffset);start=before.toString().length;}
      if(sentence.contains(range.endContainer)){const through=range.cloneRange();through.selectNodeContents(sentence);through.setEnd(range.endContainer,range.endOffset);end=through.toString().length;}
      return {sentenceIndex:Number(sentence.dataset.sentence),start,end};
    }).filter(part=>part.end>part.start);
    if(!ranges.length)return null;
    return {text,sentenceIndex:ranges[0].sentenceIndex,ranges};
  }
  return null;
}
function showSelectionMenu(selection,x,y) {
  pendingSelection=selection;const menu=document.getElementById('selection-menu');menu.hidden=false;
  document.getElementById('ask-selection').textContent=reader?.attaching?'Attach these words':'Ask about these words';
  menu.style.left=`${Math.max(10,Math.min(x,window.innerWidth-menu.offsetWidth-10))}px`;
  menu.style.top=`${Math.max(10,Math.min(y,window.innerHeight-menu.offsetHeight-10))}px`;
}
function hideSelectionMenu(){document.getElementById('selection-menu').hidden=true;pendingSelection=null;}
function openLocalPanel(selection) {
  if(!reader?.local||!selection)return;
  stopReveal();hideSelectionMenu();reader.previousFocus=document.activeElement;
  let repeatedQuestion=null;
  if(reader.attaching&&reader.selection&&pageIndex===3){
    if(selection.text===reader.selection.text&&selection.sentenceIndex===reader.selection.sentenceIndex){setReaderStatus('Choose a different passage to compare with this one.');return;}
    reader.secondary=selection;reader.attaching=false;
    repeatedQuestion=reader.turns.at(-1)?.question;reader.turns=[];
  }else{
    reader.selection={text:selection.text,sentenceIndex:selection.sentenceIndex,ranges:selection.ranges};reader.attaching=false;
    const stored=reader.markers.get(selection.sentenceIndex);const same=stored&&stored.text===selection.text;
    reader.turns=same?stored.turns:[];reader.secondary=same?stored.secondary||null:null;
  }
  reader.markers.set(reader.selection.sentenceIndex,{...reader.selection,secondary:reader.secondary,turns:reader.turns});renderAnswer();updateReaderControls();
  renderLocalPanel();
  if(repeatedQuestion)askLocal(repeatedQuestion);
  setReaderStatus('Main answer paused. Clarification is scoped to your selection.');
  window.getSelection()?.removeAllRanges();
  page.querySelector('#local-question').focus({preventScroll:true});
}
function renderLocalPanel(){
  const quotedPassage=selection=>`<div class="attached-passage"><blockquote class="selected-quote">${escapeHtml(selection.text)}</blockquote><a href="#passage-${selection.sentenceIndex}" data-source-location="${selection.sentenceIndex}">Go to this passage</a></div>`;
  const quotes=pageIndex===3?quotedPassage(reader.selection)+(reader.secondary?quotedPassage(reader.secondary):''):`<blockquote class="selected-quote">${escapeHtml(reader.selection.text)}</blockquote>`;
  page.querySelector('#local-panel-host').innerHTML=`<section class="clarification-panel" aria-label="Clarification for selected text"><div class="clarification-heading"><span>Ask about these words</span><button class="close-panel" type="button" data-close-panel>Close</button></div>${quotes}${pageIndex===3?`<div class="attachment-controls"><button class="button button-small" type="button" data-attach-passage>${reader.secondary?'Replace second passage':'Attach another passage'}</button><p class="attachment-instruction" hidden>Highlight the other passage, then choose “Attach these words.”</p></div>`:''}<div class="local-conversation" aria-live="polite"></div><form class="question-form"><label class="sr-only" for="local-question">Question about selected passage</label><input id="local-question" autocomplete="off" maxlength="300" placeholder="Ask about these words…" required><button class="button button-blue button-small" type="submit">Ask</button></form>${pageIndex===2?`<div class="source-actions"><button class="button button-small" type="button" data-show-source ${reader.turns.length?'':'disabled'}>Show the source</button></div>`:''}</section>`;
  page.querySelector('[data-close-panel]').addEventListener('click',()=>closeLocalPanel());
  page.querySelector('[data-attach-passage]')?.addEventListener('click',event=>{
    reader.attaching=!reader.attaching;hideSelectionMenu();window.getSelection()?.removeAllRanges();
    event.target.textContent=reader.attaching?'Cancel attachment':reader.secondary?'Replace second passage':'Attach another passage';
    page.querySelector('.attachment-instruction').hidden=!reader.attaching;
  });
  page.querySelector('.question-form').addEventListener('submit',event=>{event.preventDefault();const input=page.querySelector('#local-question');if(input.value.trim()){askLocal(input.value.trim());input.value='';}});
  page.querySelector('[data-show-source]')?.addEventListener('click',()=>askLocal('Show the source'));
  renderLocalTurns();
}
function askLocal(question) {
  if(!reader.selection)return;
  const index=reader.selection.sentenceIndex;const normalized=question.toLowerCase();let answer;
  if(pageIndex===1){
    answer='Here the LLM would generate a reply based on the highlighted text. For this demo, every question receives the same example: a causal bridging inference connects events by adding a link the story leaves unstated. Ditto dabs the spill with the essay; later, Jinho sees stains. The reader supplies the idea that coffee transferred onto the paper. Chapter 9 discusses causal bridges on pp. 263–264.';
  }else if(pageIndex===3){
    if(!reader.secondary){
      answer='This passage says the exact stain colors are not established. To compare it with what was said earlier, attach that earlier passage to the same question.';
    }else if([reader.selection,reader.secondary].some(selection=>selection.text.includes('black and red'))){
      answer='With both passages attached, the LLM would compare the claims. In this example, yes: the earlier passage asserts that the stains are black and red, while the later passage says their exact colors are not established. The earlier claim overstates the story. Black coffee stains are a plausible inference; red grading marks are not necessarily the stains Jinho notices. Revise the earlier claim to preserve that qualification.';
    }else{
      answer='Both passages would be supplied to the LLM with this question. This demo’s example compares the opening claim, “The stains on the essay are black and red,” with the later qualification. Attach that opening claim to see the example comparison.';
    }
  }else if(/source|chapter|evidence|pdf/.test(normalized)){
    answer='Chapter 9, pp. 263–264, defines bridging inferences as additions that connect a new proposition to the existing discourse model. It includes causal relations. Compare that account with the inferred coffee transfer; the office-story application is our interpretation, not a chapter quotation.';
    const note=page.querySelector('[data-source-note]');if(note)note.hidden=false;
  }else if(/assum|wrong|certain|prove|color/.test(normalized)){
    answer='The text names black coffee and a red marker. Black coffee stains follow plausibly from using the essay to dab the spill, but red grading marks are not necessarily the stains Jinho notices. The final colors are not explicitly reported.';
  }else if(/example/.test(normalized)){
    answer='Compare “the coffee was black” with “the stains were black.” The first is stated in the story. The second connects the spill, dabbing, and later stains by inference.';
  }else if(index>=6){
    answer='Red grading marks may be on the essay, but the text does not identify them as the stains. Distinguish an explicitly named marker color from an inferred final stain color.';
  }else if(index>=4){
    answer='The story says Ditto dabbed the spill with the essay, then Jinho saw stains. The reader adds the connection that coffee transferred onto the paper. That causal bridge is inferred, not directly stated.';
  }else{
    answer='“He” is most plausibly Will because the earlier “him” points to Will at the desk and the office context carries that referent forward. Check Chapter 9’s account of anaphoric reference rather than applying a nearest-name rule.';
  }
  reader.turns.push({question,answer});reader.markers.set(index,{...reader.selection,secondary:reader.secondary,turns:reader.turns});renderLocalTurns();
  if(pageIndex===2){
    happyState={selection:{...reader.selection},turns:reader.turns.map(turn=>({...turn})),sourceVisible:!page.querySelector('[data-source-note]').hidden};
    page.querySelector('[data-show-source]').disabled=false;
  }
}
function renderLocalTurns() {
  const host=page.querySelector('.local-conversation');if(!host)return;
  const turns=reader.turns;
  host.innerHTML=turns.map(localTurnMarkup).join('');
  host.scrollTop=host.scrollHeight;
}
function localTurnMarkup(turn){return `<div class="local-turn"><div class="message-role">User</div><p class="local-turn-question">${escapeHtml(turn.question)}</p><div class="message-role">LLM</div><p class="local-turn-answer">${escapeHtml(turn.answer)}</p></div>`;}
function closeLocalPanel(restoreFocus=true) {
  const host=page.querySelector('#local-panel-host');if(host)host.innerHTML='';if(!reader)return;
  const anchorIndex=reader.selection?.sentenceIndex;
  reader.selection=null;reader.secondary=null;reader.attaching=false;hideSelectionMenu();renderAnswer();setReaderStatus('Clarification saved at its sentence. Resume when you are ready.');
  if(restoreFocus){const action=page.querySelector(`[data-anchor="${anchorIndex}"]`)||page.querySelector('[data-play]:not(:disabled)');action?.focus({preventScroll:true});}
}
function showConventionalFollowup() {
  const host=page.querySelector('#local-panel-host');
  host.innerHTML=`<div class="classic-followup"><div class="followup-question"><div class="message-role">User</div><p>What is a causal bridging inference?</p></div><div class="message-role">LLM</div><div class="followup-answer"><p>To explain this term, let’s go back through the entire story. Ditto is grading an essay, Will is preparing slides, and Eleanor is watering plants. These details establish a setting with several people and objects. The reader resolves pronouns such as “him,” “He,” “She,” and “it,” and keeps track of the essay even when different people interact with it. Chapter 9 describes this as part of connecting propositions and building a situation model.</p><p>The coffee spill then introduces a problem. Eleanor notices it, but the paper towels have run out, so Ditto uses the essay instead. Later, Jinho sees stains. A reader can connect these events by supplying an unstated causal step: dabbing the spill puts coffee onto the paper. This is the sort of causal connection discussed under bridging inferences. We should also distinguish the black coffee from the red grading marks and ask whether both should count as stains. More generally, Chapter 9 distinguishes bridging inferences needed for coherence from elaborative inferences that add information beyond those connections…</p></div></div>`;
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-go]');if(nav){goPage(Number(nav.dataset.go));return;}
  const scene=event.target.closest('[data-scene]');if(scene&&!scene.disabled){setScene(Number(scene.dataset.scene));return;}
  const happy=event.target.closest('[data-happy-step]');if(happy&&!happy.disabled){happyStep=Number(happy.dataset.happyStep);renderPage();return;}
  const sourceLocation=event.target.closest('[data-source-location]');if(sourceLocation){event.preventDefault();const passage=page.querySelector(`#passage-${sourceLocation.dataset.sourceLocation}`);passage?.scrollIntoView({block:'center',behavior:'instant'});passage?.focus({preventScroll:true});return;}
  const pace=event.target.closest('[data-pace-mode]');if(pace){paceMode=pace.dataset.paceMode;renderPage();return;}
  const failure=event.target.closest('[data-failure]');if(failure&&!failure.disabled){failureView=failure.dataset.failure;renderPage();return;}
  const verdict=event.target.closest('[data-verdict]');if(verdict){page.querySelectorAll('[data-verdict]').forEach(button=>button.setAttribute('aria-pressed',String(button===verdict)));page.querySelector('.verdict-status').textContent=`Your judgment: ${verdict.dataset.verdict}.`;return;}
  if(!event.target.closest('#selection-menu')&&!(event.target.closest('#answer-body')&&pendingSelection))hideSelectionMenu();
});
document.addEventListener('input',event=>{if(event.target.id==='scene-position')setScene(Number(event.target.value));});
document.getElementById('ask-selection').addEventListener('click',()=>{const selection=pendingSelection;if(selection)openLocalPanel(selection);});
document.getElementById('previous-page').addEventListener('click',()=>goPage(pageIndex-1));
document.getElementById('next-page').addEventListener('click',()=>goPage(pageIndex+1));
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'){hideSelectionMenu();if(reader?.selection)closeLocalPanel();return;}
  if(event.target.closest('input,textarea,select,button,details')||window.getSelection()?.toString())return;
  if(event.key==='ArrowRight'){event.preventDefault();goPage(pageIndex+1);}
  if(event.key==='ArrowLeft'){event.preventDefault();goPage(pageIndex-1);}
});
window.addEventListener('hashchange',()=>{const index=chapters.findIndex(([slug])=>`#${slug}`===location.hash);if(index>=0&&index<availablePages){pageIndex=index;renderPage({focus:true});}});
window.addEventListener('resize',hideSelectionMenu);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopBurst();if(reader?.playing){stopReveal();renderAnswer();updateReaderControls();setReaderStatus('Paused while this tab is out of view.');}}else if(pageIndex===1&&sceneIndex===1)startBurstLoop();});
const initialPage=chapters.findIndex(([slug])=>`#${slug}`===location.hash);if(initialPage>=0&&initialPage<availablePages)pageIndex=initialPage;
renderPage();
