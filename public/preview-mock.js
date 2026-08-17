
(() => {
  const RealDate = window.Date;
  const PREVIEW_NOW = new RealDate('2026-08-09T15:00:00Z').getTime();
  class PreviewDate extends RealDate {
    constructor(...args) { super(...(args.length ? args : [PREVIEW_NOW])); }
    static now() { return PREVIEW_NOW; }
  }
  PreviewDate.parse = RealDate.parse;
  PreviewDate.UTC = RealDate.UTC;
  window.Date = PreviewDate;

  const STORAGE_KEY = 'gg_internal_saas_v14_preview';
  const deepCopy = (value) => JSON.parse(JSON.stringify(value));
  const iso = (value) => new RealDate(value).toISOString();

  function seed() {
    const classes = [
      { id:'c1', programme_name:'Irish for Primary Teaching', day_of_week:1, start_time:'19:00', timezone:'Europe/Dublin', active:true, created_at:iso('2026-06-01'), student_count:5, label:'Irish for Primary Teaching | Monday | 19:00', join_url:'https://us02web.zoom.us/j/8123456789', join_note:'Passcode 4821' },
      { id:'c2', programme_name:'Irish for Primary Teaching', day_of_week:4, start_time:'19:00', timezone:'Europe/Dublin', active:true, created_at:iso('2026-06-02'), student_count:2, label:'Irish for Primary Teaching | Thursday | 19:00', join_url:null, join_note:null },
    ];
    const users = [
      { id:'admin1', role:'admin', name:'Éamon Corcoran', email:'admin@gaeilgeoirguides.com', mustChangePassword:false, active:true },
      { id:'s1', role:'student', name:'Sarah Murphy', email:'sarah@example.com', class_id:'c1', active:true, must_change_password:false, mustChangePassword:false, last_login_at:iso('2026-08-08T10:00:00Z') },
      { id:'s2', role:'student', name:'Aoife Walsh', email:'aoife@example.com', class_id:'c1', active:true, must_change_password:false, mustChangePassword:false, last_login_at:iso('2026-08-07T12:00:00Z') },
      { id:'s3', role:'student', name:"Niamh O'Brien", email:'niamh@example.com', class_id:'c1', active:true, must_change_password:true, mustChangePassword:true, last_login_at:null },
      { id:'s4', role:'student', name:'Conor Byrne', email:'conor@example.com', class_id:'c1', active:true, must_change_password:false, mustChangePassword:false, last_login_at:iso('2026-08-06T09:00:00Z') },
      { id:'s5', role:'student', name:'Emma Flynn', email:'emma@example.com', class_id:'c1', active:true, must_change_password:false, mustChangePassword:false, last_login_at:iso('2026-08-08T16:00:00Z') },
      { id:'s6', role:'student', name:'Paul Moran', email:'paul@example.com', class_id:'c2', active:true, must_change_password:false, mustChangePassword:false, last_login_at:iso('2026-08-04T10:00:00Z') },
      { id:'s7', role:'student', name:'Clare Healy', email:'clare@example.com', class_id:'c2', active:true, must_change_password:true, mustChangePassword:true, last_login_at:null },
    ];
    const weeks = [
      { id:'w1', class_id:'c1', week_start:'2026-07-13', checkin_enabled:true, checkin_release_at:iso('2026-07-17T14:00:00Z'), checkin_due_at:iso('2026-07-19T19:00:00Z') },
      { id:'w2', class_id:'c1', week_start:'2026-07-20', checkin_enabled:true, checkin_release_at:iso('2026-07-24T14:00:00Z'), checkin_due_at:iso('2026-07-26T19:00:00Z') },
      { id:'w3', class_id:'c1', week_start:'2026-07-27', checkin_enabled:true, checkin_release_at:iso('2026-07-31T14:00:00Z'), checkin_due_at:iso('2026-08-02T19:00:00Z') },
      { id:'w4', class_id:'c1', week_start:'2026-08-03', checkin_enabled:true, checkin_release_at:iso('2026-08-07T14:00:00Z'), checkin_due_at:iso('2026-08-09T19:00:00Z') },
      { id:'tw1', class_id:'c2', week_start:'2026-07-20', checkin_enabled:true, checkin_release_at:iso('2026-07-24T14:00:00Z'), checkin_due_at:iso('2026-07-26T19:00:00Z') },
      { id:'tw2', class_id:'c2', week_start:'2026-07-27', checkin_enabled:true, checkin_release_at:iso('2026-07-31T14:00:00Z'), checkin_due_at:iso('2026-08-02T19:00:00Z') },
      { id:'tw3', class_id:'c2', week_start:'2026-08-03', checkin_enabled:true, checkin_release_at:iso('2026-08-07T14:00:00Z'), checkin_due_at:iso('2026-08-09T19:00:00Z') },
    ];
    const assignments = [
      { id:'a1', class_id:'c1', week_id:'w1', title:'Building confident answers', instructions:'Answer each question in Irish.', loom_url:null, visible_at:iso('2026-07-13'), deadline_at:iso('2026-07-19T18:00:00Z'), reopened_until:null, hard_deadline:true, reminders_enabled:true, status:'published',
        questions:[{id:'q11',position:0,prompt:'Write three sentences about your week.',imageUrl:null,required:true},{id:'q12',position:1,prompt:'Use one past-tense verb.',imageUrl:null,required:true}], resources:[] },
      { id:'a2', class_id:'c1', week_id:'w2', title:'Conditional tense practice', instructions:'Use the conditional tense in each response.', loom_url:null, visible_at:iso('2026-07-20'), deadline_at:iso('2026-07-26T18:00:00Z'), reopened_until:null, hard_deadline:true, reminders_enabled:true, status:'published',
        questions:[{id:'q21',position:0,prompt:'Write three original conditional sentences.',imageUrl:null,required:true},{id:'q22',position:1,prompt:'Explain what you would do with a free weekend.',imageUrl:null,required:true}], resources:[{id:'r21',fileName:'Conditional-tense-notes.pdf',fileUrl:'#',mimeType:'application/pdf'}] },
      { id:'a3', class_id:'c1', week_id:'w3', title:'Reading response', instructions:'Read the passage and answer in Irish.', loom_url:null, visible_at:iso('2026-07-27'), deadline_at:iso('2026-08-02T18:00:00Z'), reopened_until:null, hard_deadline:true, reminders_enabled:true, status:'published',
        questions:[{id:'q31',position:0,prompt:'Summarise the passage in four sentences.',imageUrl:null,required:true}], resources:[], allow_uploads:true, uploads_required:false, accepted_file_types:['image','pdf'], max_files:3 },
      { id:'a4', class_id:'c1', week_id:'w4', title:'Oral phrase revision', instructions:'Complete each short prompt. Your draft saves automatically.', loom_url:null, visible_at:iso('2026-08-03'), deadline_at:iso('2026-08-09T18:30:00Z'), reopened_until:null, hard_deadline:true, reminders_enabled:true, status:'published',
        questions:[{id:'q41',position:0,prompt:'Write five useful classroom phrases in Irish.',imageUrl:null,required:true},{id:'q42',position:1,prompt:'Use two of the phrases in a short dialogue.',imageUrl:null,required:true},{id:'q43',position:2,prompt:'What phrase do you most want to remember?',imageUrl:null,required:false}], resources:[{id:'r41',fileName:'Phrase-list.pdf',fileUrl:'#',mimeType:'application/pdf'}] },
      { id:'ta1', class_id:'c2', week_id:'tw2', title:'Thursday class revision', instructions:'Review this week’s phrases.', loom_url:null, visible_at:iso('2026-07-27'), deadline_at:iso('2026-08-02T18:00:00Z'), reopened_until:null, hard_deadline:true, reminders_enabled:true, status:'published',
        questions:[{id:'tq1',position:0,prompt:'Write four useful phrases.',imageUrl:null,required:true}], resources:[] },
    ];
    const attendance = [];
    const attendancePattern = {
      s1:['live','missed','live','live'], s2:['live','live','partial','live'], s3:['missed','live','live','missed'],
      s4:['live','recording','live','live'], s5:['live','live','missed','live']
    };
    Object.entries(attendancePattern).forEach(([studentId,statuses]) => {
      ['w1','w2','w3','w4'].forEach((weekId,index) => attendance.push({
        id:`at-${studentId}-${weekId}`, student_id:studentId, week_id:weekId,
        status:statuses[index], minutes:statuses[index]==='live'?68:statuses[index]==='partial'?24:0, source:'csv', notes:''
      }));
    });
    attendance.push({id:'at-s6-tw2',student_id:'s6',week_id:'tw2',status:'live',minutes:72,source:'csv',notes:''});
    attendance.push({id:'at-s7-tw2',student_id:'s7',week_id:'tw2',status:'missed',minutes:0,source:'csv',notes:''});

    const checkins = [
      { id:'ch-s1-w1', student_id:'s1', week_id:'w1', status:'returned', answers:{attendance:'I attended live',reviewed:'Yes',understanding:8,confidence:7,weeklyWin:'I used three Irish phrases naturally.',support:'I want more speaking practice.'}, ai_feedback:'Strong work this week.', teacher_feedback:'Strong work this week, Sarah. Your weekly win shows that you are starting to use Irish more naturally. Keep using one phrase aloud each day.', feedback_state:'returned', submitted_at:iso('2026-07-18'), feedback_returned_at:iso('2026-07-19'), feedback_read_at:null },
      { id:'ch-s1-w2', student_id:'s1', week_id:'w2', status:'submitted', answers:{attendance:'I watched the recording',reviewed:'Yes',understanding:7,confidence:6,weeklyWin:'I understood the conditional tense better.',support:'I need help speaking without overthinking.'}, ai_feedback:'Good progress this week, Sarah. Your understanding is improving. Practise one conditional sentence aloud each day and keep the structure simple.', teacher_feedback:'Good progress this week, Sarah. Your understanding is improving. Practise one conditional sentence aloud each day and keep the structure simple.', feedback_state:'ai_drafted', submitted_at:iso('2026-07-25'), feedback_returned_at:null, feedback_read_at:null },
      { id:'ch-s2-w1', student_id:'s2', week_id:'w1', status:'returned', answers:{attendance:'I attended live',reviewed:'Yes',understanding:9,confidence:8,weeklyWin:'I answered a question in Irish.',support:''}, ai_feedback:'Excellent.', teacher_feedback:'Excellent progress. Keep building on the confidence you showed in class.', feedback_state:'returned', submitted_at:iso('2026-07-18'), feedback_returned_at:iso('2026-07-19'), feedback_read_at:iso('2026-07-20') },
      { id:'ch-s2-w2', student_id:'s2', week_id:'w2', status:'submitted', answers:{attendance:'I attended live',reviewed:'Yes',understanding:8,confidence:7,weeklyWin:'I revised twice.',support:'Pronunciation.'}, ai_feedback:'Well done this week. Repeat the phrases slowly once, then at natural speed.', teacher_feedback:'Well done this week. Repeat the phrases slowly once, then at natural speed.', feedback_state:'ai_drafted', submitted_at:iso('2026-07-25') },
      { id:'ch-s3-w1', student_id:'s3', week_id:'w1', status:'submitted', answers:{attendance:'Not yet',reviewed:'No',understanding:5,confidence:4,weeklyWin:'I opened the notes.',support:'I am behind.'}, ai_feedback:'Thanks for being honest. Start with ten minutes of review and one simple sentence.', teacher_feedback:'Thanks for being honest. Start with ten minutes of review and one simple sentence.', feedback_state:'teacher_edited', submitted_at:iso('2026-07-18') },
      { id:'ch-s4-w3', student_id:'s4', week_id:'w3', status:'submitted', answers:{attendance:'I attended live',reviewed:'Yes',understanding:8,confidence:8,weeklyWin:'I spoke Irish with a friend.',support:''}, ai_feedback:'Great progress. Keep the conversation habit going.', teacher_feedback:'Great progress. Keep the conversation habit going.', feedback_state:'ai_drafted', submitted_at:iso('2026-08-01') },
    ];

    const homework = [
      { id:'hw-s1-a1', student_id:'s1', assignment_id:'a1', status:'returned', answers:['Bhí seachtain mhaith agam. D’oibrigh mé go crua. Chuaigh mé ag siúl.','Chuaigh mé go dtí an siopa inné.'], current_question:1, submitted_at:iso('2026-07-18'), ai_corrections:'No Irish corrections needed.', ai_general_feedback:'Clear, accurate work.', teacher_corrections:'No Irish corrections needed.', teacher_general_feedback:'Clear, accurate work. Your sentences are natural and easy to follow. Keep using the past tense in short spoken answers.', feedback_state:'returned', feedback_returned_at:iso('2026-07-19'), feedback_read_at:null },
      { id:'hw-s1-a2', student_id:'s1', assignment_id:'a2', status:'submitted', answers:['Dá mbeadh an t-am agam, rachainn go Gaillimh. Cheannóinn leabhar nua. Dhéanfainn níos mó cleachtaidh.','Dá mbeadh deireadh seachtaine saor agam, rachainn ag siúl agus bhuailfinn le cairde.'], current_question:1, submitted_at:iso('2026-07-25'), ai_corrections:'"bhualfainn"\nCorrection: bhuailfinn', ai_general_feedback:'Good use of the conditional tense. Your meaning is clear and the structures are mostly accurate. Review the one correction and read the sentences aloud.', teacher_corrections:'"bhualfainn"\nCorrection: bhuailfinn', teacher_general_feedback:'Good use of the conditional tense. Your meaning is clear and the structures are mostly accurate. Review the one correction and read the sentences aloud.', feedback_state:'ai_drafted', feedback_returned_at:null, feedback_read_at:null },
      { id:'hw-s2-a1', student_id:'s2', assignment_id:'a1', status:'returned', answers:['Bhí mé gnóthach. D’imir mé peil. Chonaic mé mo chairde.','D’imir mé peil.'], current_question:1, submitted_at:iso('2026-07-18'), ai_corrections:'No Irish corrections needed.', ai_general_feedback:'Very good.', teacher_corrections:'No Irish corrections needed.', teacher_general_feedback:'Very good work. Your verbs are accurate and your answers are concise.', feedback_state:'returned', feedback_returned_at:iso('2026-07-19'), feedback_read_at:iso('2026-07-20') },
      { id:'hw-s2-a2', student_id:'s2', assignment_id:'a2', status:'submitted', answers:['Dá mbeadh airgead agam, cheannóinn carr.','Rachainn go Corcaigh.'], current_question:1, submitted_at:iso('2026-07-25'), ai_corrections:'No Irish corrections needed.', ai_general_feedback:'Good work. Expand the second answer with one more detail.', teacher_corrections:'No Irish corrections needed.', teacher_general_feedback:'Good work. Expand the second answer with one more detail.', feedback_state:'ai_drafted' },
      { id:'hw-s3-a1', student_id:'s3', assignment_id:'a1', status:'submitted', answers:['Tá mé maith go. Conas tá tú.','Chuaigh mé scoil.'], current_question:1, submitted_at:iso('2026-07-18'), ai_corrections:'"Tá mé maith go"\nCorrection: Tá mé go maith\n\n"Conas tá tú"\nCorrection: Conas atá tú?\n\n"Chuaigh mé scoil"\nCorrection: Chuaigh mé ar scoil', ai_general_feedback:'Good attempt. Your meaning is understandable. Review the three corrections and repeat the improved sentences aloud.', teacher_corrections:'"Tá mé maith go"\nCorrection: Tá mé go maith\n\n"Conas tá tú"\nCorrection: Conas atá tú?\n\n"Chuaigh mé scoil"\nCorrection: Chuaigh mé ar scoil', teacher_general_feedback:'Good attempt. Your meaning is understandable. Review the three corrections and repeat the improved sentences aloud.', feedback_state:'ai_drafted' },
      { id:'hw-s4-a3', student_id:'s4', assignment_id:'a3', status:'submitted', answers:['Bhí an sliocht faoi theaghlach agus faoi shaol na tuaithe.'], current_question:0, submitted_at:iso('2026-08-01'), ai_corrections:'No Irish corrections needed.', ai_general_feedback:'A clear summary. Add one more supporting detail.', teacher_corrections:'No Irish corrections needed.', teacher_general_feedback:'A clear summary. Add one more supporting detail.', feedback_state:'teacher_edited' },
      { id:'hw-s1-a4', student_id:'s1', assignment_id:'a4', status:'draft', answers:['Oscail do leabhar. Dún an doras. Éist liom.','',''], current_question:0, feedback_state:'none' },
    ];

    const categories = [
      { id:'cat1', class_id:'c1', name:'General', position:0 },
      { id:'cat2', class_id:'c1', name:'Questions', position:1 },
      { id:'cat3', class_id:'c1', name:'Wins', position:2 },
      { id:'cat4', class_id:'c1', name:'Resources', position:3 },
      { id:'cat5', class_id:'c2', name:'General', position:0 },
      { id:'cat6', class_id:'c2', name:'Questions', position:1 },
    ];

    const threads = [
      { id:'t1', class_id:'c1', author_id:'admin1', category_id:'cat1', title:'Start here: how this board works', body:'Use this for anything you would otherwise email me about the course. If you are stuck on something, post it here rather than sitting with it for a week. Somebody else in the group is nearly always wondering the same thing, and answering it once helps everyone.\n\nI read everything here.', pinned:true, locked:false, deleted_at:null, created_at:iso('2026-06-05T09:00:00Z'), published_at:iso('2026-06-05T09:00:00Z'), last_activity_at:iso('2026-08-07T19:20:00Z') },
      { id:'t2', class_id:'c1', author_id:'s2', category_id:'cat2', title:'When do we use an tuiseal ginideach after a verbal noun?', body:'I keep getting this wrong in the homework. Is there a simple rule for when the noun after ag + verbal noun goes into the genitive, or is it just something you learn case by case?', pinned:false, locked:false, deleted_at:null, published_at:iso('2026-08-06T20:10:00Z'), created_at:iso('2026-08-06T20:10:00Z'), last_activity_at:iso('2026-08-07T19:20:00Z') },
      { id:'t3', class_id:'c1', author_id:'s4', category_id:'cat1', title:'Study group before the TEG exam?', body:'Is anyone interested in meeting on a Saturday morning to practise the oral? I was thinking every second week. Happy to set up the call if there is interest.', pinned:false, locked:false, deleted_at:null, published_at:iso('2026-08-08T11:00:00Z'), created_at:iso('2026-08-08T11:00:00Z'), last_activity_at:iso('2026-08-08T18:45:00Z') },
      { id:'t5', class_id:'c1', author_id:'s5', category_id:'cat3', title:'Spoke Irish to a parent at the school gate today', body:'Only two sentences and I got the tenses wrong halfway through, but she answered me in Irish and we kept going for a minute. Six months ago I would have switched to English straight away.', pinned:false, locked:false, deleted_at:null, published_at:iso('2026-08-08T16:20:00Z'), created_at:iso('2026-08-08T16:20:00Z'), last_activity_at:iso('2026-08-09T09:15:00Z') },
      { id:'t6', class_id:'c1', author_id:'s1', category_id:'cat4', title:'Free podcast that has helped my listening', body:'Bitesize Irish do short episodes at a slow pace and there is a transcript for each one. Ten minutes on the drive to work and I am picking up far more in class.', pinned:false, locked:false, deleted_at:null, published_at:iso('2026-08-04T07:40:00Z'), created_at:iso('2026-08-04T07:40:00Z'), last_activity_at:iso('2026-08-05T12:00:00Z') },
      { id:'t7', class_id:'c1', author_id:'admin1', category_id:'cat1', title:'Reminder: no class next Monday', body:'We are skipping the bank holiday. Back the following week, and the check-in for that week is switched off.', pinned:false, locked:false, deleted_at:null, created_at:iso('2026-08-09T10:00:00Z'), published_at:iso('2026-08-11T08:00:00Z'), last_activity_at:iso('2026-08-11T08:00:00Z') },
      { id:'t4', class_id:'c1', author_id:'s3', category_id:'cat1', title:'Posted in the wrong place', body:'Sorry, meant to send this privately.', pinned:false, locked:false, deleted_at:iso('2026-08-05T10:00:00Z'), published_at:iso('2026-08-05T09:00:00Z'), created_at:iso('2026-08-05T09:00:00Z'), last_activity_at:iso('2026-08-05T09:00:00Z') },
    ];

    /* Enough likes that the counts are not all zero, spread so the Top sort
       actually reorders the feed. */
    const attachments = [
      { id:'at1', thread_id:'t1', kind:'file', url:'#', file_name:'How-this-works.pdf', mime_type:'application/pdf', size_bytes:118000, position:0 },
      { id:'at2', thread_id:'t5', kind:'gif', url:'https://media.giphy.com/media/xUOxf1XbxSNwZMSMSc/giphy.gif', position:0 },
      { id:'at3', thread_id:'t6', kind:'loom', url:'https://www.loom.com/share/preview1234', position:0 },
    ];

    const likes = [
      { user_id:'s1', target_type:'thread', target_id:'t1' }, { user_id:'s2', target_type:'thread', target_id:'t1' },
      { user_id:'s4', target_type:'thread', target_id:'t1' },
      { user_id:'s1', target_type:'thread', target_id:'t5' }, { user_id:'s2', target_type:'thread', target_id:'t5' },
      { user_id:'s3', target_type:'thread', target_id:'t5' }, { user_id:'s4', target_type:'thread', target_id:'t5' },
      { user_id:'admin1', target_type:'thread', target_id:'t5' },
      { user_id:'s5', target_type:'thread', target_id:'t2' }, { user_id:'admin1', target_type:'thread', target_id:'t6' },
      { user_id:'s2', target_type:'post', target_id:'p2' }, { user_id:'s4', target_type:'post', target_id:'p2' },
      { user_id:'s1', target_type:'post', target_id:'p2' },
    ];

    const posts = [
      { id:'p1', thread_id:'t2', author_id:'s1', body:'I had the same question last term. The way it was explained to me is that the noun after ag + verbal noun behaves like it is being possessed by the action, so it takes the genitive.', deleted_at:null, created_at:iso('2026-08-07T08:30:00Z') },
      { id:'p2', thread_id:'t2', author_id:'admin1', body:'That is close, and it is a good instinct. The rule of thumb: after a verbal noun, a following definite noun usually goes into an tuiseal ginideach — ag déanamh na hoibre, ag léamh an leabhair. Where it trips people up is that an indefinite noun often does not change at all: ag déanamh obair bhaile.\n\nI will bring three examples to Monday and we will work through them aloud.', deleted_at:null, created_at:iso('2026-08-07T19:20:00Z') },
      { id:'p3', thread_id:'t3', author_id:'s5', body:'I would be interested. Saturday mornings suit me better than evenings.', deleted_at:null, created_at:iso('2026-08-08T14:00:00Z') },
      { id:'p4', thread_id:'t3', author_id:'s1', body:'Count me in too.', deleted_at:null, created_at:iso('2026-08-08T18:45:00Z') },
      { id:'p5', thread_id:'t5', author_id:'admin1', body:'This is exactly the thing. Two sentences with a real person beats an hour of drills, and the tenses will settle. Well done.', deleted_at:null, created_at:iso('2026-08-09T09:15:00Z') },
      { id:'p6', thread_id:'t6', author_id:'s3', body:'Downloaded, thanks. The transcripts are the part I needed.', deleted_at:null, created_at:iso('2026-08-05T12:00:00Z') },
    ];

    return {
      sessionUserId:'admin1',
      users, classes, weeks, assignments, attendance, checkins, homework, notes:[], withdrawals:[], homeworkFiles:[], dismissals:[],
      threads, posts, reads:[], categories, likes, attachments,
      settings:{
        email:{provider:'console',fromName:'Gaeilgeoir Guides',fromAddress:'support@gaeilgeoirguides.com',replyTo:'support@gaeilgeoirguides.com',webhookUrl:'',smtpHost:'',smtpUser:'',configured:false},
        reminders:{
          enabled:true,
          tomorrow:{enabled:true,subject:'Your {{assignment_title}} is due tomorrow',body:'Hi {{first_name}},\n\nYour homework is due tomorrow at {{deadline_time}}.\n\n{{assignment_link}}'},
          twoHours:{enabled:true,subject:'{{assignment_title}} is due in 2 hours',body:'Hi {{first_name}},\n\nYour homework is due in 2 hours.\n\n{{assignment_link}}'},
          thirtyMinutes:{enabled:true,subject:'30 minutes left for {{assignment_title}}',body:'Hi {{first_name}},\n\nThere are 30 minutes left.\n\n{{assignment_link}}'}
        },
        openai:{configured:true,model:'gpt-5.6'},
        nudge:{
          checkinSubject:'Your weekly check-in, {{first_name}}',
          checkinBody:'Hi {{first_name}},\n\nI noticed your check-in for {{item_title}} has not come in yet. It only takes two minutes and it genuinely helps me plan the next class around where you are.\n\nYou can do it here: {{link}}\n\nNo bother at all if you have been busy, just send it on when you get a chance.',
          homeworkSubject:'{{item_title}} is still open, {{first_name}}',
          homeworkBody:'Hi {{first_name}},\n\nJust a gentle nudge that {{item_title}} has not been submitted yet. The deadline is {{deadline}}.\n\nYou can pick it up where you left off here: {{link}}\n\nIf something is in the way, reply and let me know.'
        },
        dictation:{transcribeModel:'gpt-4o-transcribe',cleanupModel:'gpt-4.1-mini',language:'auto',dictionary:['Gaeilgeoir Guides','An Caighdeán Oifigiúil','TEG B2','Leaving Certificate Irish','an tuiseal ginideach','an modh coinníollach','séimhiú','urú']},
        voicePrompts:{
          cleanupPrompt:'You turn raw speech transcripts into text the speaker would have typed themselves. Remove fillers, honour self-corrections, fix the English fully, and leave Irish wording exactly as spoken. Break anything longer than three sentences into short paragraphs. Output ONLY the cleaned text.',
          lightPrompt:'Add punctuation and casing to this raw speech transcript and remove fillers. Never change, translate or correct any Irish wording. Output ONLY the corrected text.'
        },
        prompts:{
          checkinPrompt:'You are a warm and experienced Irish-language teacher. Reply directly to the student’s actual check-in.',
          correctionPrompt:'Correct genuine errors using An Caighdeán Oifigiúil. If there are no corrections, say: No Irish corrections needed.',
          generalFeedbackPrompt:'Give friendly, concise teacher feedback in 2 to 3 lines.'
        }
      },
      counters:{class:3,student:8,assignment:6,checkin:20,homework:20,attendance:50,thread:10,post:10,category:10,attachment:20}
    };
  }

  /**
   * Reconciles a database saved by an older build against the current shape.
   *
   * The preview keeps its data in localStorage between visits, so someone who
   * used it last month is still carrying that month-old object. Any collection
   * or settings group added since then is simply missing, and the first bit of
   * code to reach for it fails. Rather than fixing each one as it breaks, every
   * key the current seed knows about is backfilled on load, and rows are topped
   * up with fields added later.
   */
  function migrate(stored) {
    const fresh = seed();
    if (!stored || typeof stored !== 'object') return fresh;

    for (const [key, value] of Object.entries(fresh)) {
      if (stored[key] == null) stored[key] = value;
      else if (Array.isArray(value) && !Array.isArray(stored[key])) stored[key] = value;
    }
    // Settings gained whole new groups: dictation, voice prompts, nudge wording.
    stored.settings = stored.settings && typeof stored.settings === 'object' ? stored.settings : {};
    for (const [key, value] of Object.entries(fresh.settings)) {
      if (stored.settings[key] == null) stored.settings[key] = value;
    }
    if(!Array.isArray(stored.dismissals)) stored.dismissals=[];
    // The library and the board arrived after some browsers had already stored a
    // preview. Seed them rather than leaving the new screens permanently empty.
    if(!Array.isArray(stored.threads)) stored.threads=fresh.threads;
    if(!Array.isArray(stored.posts)) stored.posts=fresh.posts;
    if(!Array.isArray(stored.reads)) stored.reads=[];
    // Categories and likes arrived with the feed rebuild.
    if(!Array.isArray(stored.categories)) stored.categories=fresh.categories;
    if(!Array.isArray(stored.likes)) stored.likes=fresh.likes;
    if(!Array.isArray(stored.attachments)) stored.attachments=fresh.attachments;
    (stored.classes || []).forEach((klass) => {
      const seeded=fresh.classes.find((row)=>row.id===klass.id);
      if(klass.join_url===undefined) klass.join_url=seeded?.join_url??null;
      if(klass.join_note===undefined) klass.join_note=seeded?.join_note??null;
    });
    // Fields added to existing rows after they were first written.
    (stored.weeks || []).forEach((week) => {
      if (week.checkin_hard_deadline === undefined) week.checkin_hard_deadline = true;
      if (week.checkin_enabled === undefined) week.checkin_enabled = true;
    });
    (stored.assignments || []).forEach((assignment) => {
      if (!assignment.status) assignment.status = 'published';
    });
    [...(stored.checkins || []), ...(stored.homework || [])].forEach((row) => {
      if (row.voice_note === undefined) row.voice_note = null;
    });
    return stored;
  }

  let db;
  try { db = migrate(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { db = seed(); }
  save();

  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch {} }
  function currentUser() { return db.users.find((user) => user.id === db.sessionUserId) || null; }
  function classLabel(row) {
    const days=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
    return row.label || `${row.programme_name} | ${days[Number(row.day_of_week)]} | ${String(row.start_time).slice(0,5)}`;
  }
  /* Mirrors studentProgress in src/status.js. Kept deliberately small: the real
     rule lives on the server and is tested there. */
  const PREVIEW_MILESTONES=[1,3,5,10,15,20,30,40,50,75,100];
  function previewProgress(checkins, homework) {
    const done=(rows)=>rows.filter((r)=>r.status&&r.status!=='draft').length;
    const total=done(checkins)+done(homework);
    const next=PREVIEW_MILESTONES.find((m)=>m>total)??null;
    const previous=[...PREVIEW_MILESTONES].reverse().find((m)=>m<=total)??0;
    return {checkins:done(checkins),homework:done(homework),total,next,
      toNext:next?next-total:0,
      towards:next?Math.round(((total-previous)/(next-previous))*100):100,
      justHit:PREVIEW_MILESTONES.includes(total)?total:null};
  }
  function json(data, status=200) {
    return new Response(status === 204 ? null : JSON.stringify(data), {
      status, headers:{'Content-Type':'application/json'}
    });
  }
  function error(message, status=400) { return json({error:message}, status); }
  async function bodyOf(options={}) {
    if (!options.body) return {};
    if (options.body instanceof FormData) return options.body;
    if (typeof options.body === 'string') {
      try { return JSON.parse(options.body); } catch { return {}; }
    }
    return options.body;
  }
  function studentRows(classId=null) {
    return db.users.filter((user)=>user.role==='student' && user.active && (!classId || user.class_id===classId))
      .map((user)=>{
        const klass=db.classes.find((item)=>item.id===user.class_id);
        return {...user,classLabel:klass?classLabel(klass):null};
      });
  }
  function assignmentRows(classId=null) {
    return db.assignments.filter((item)=>!classId || item.class_id===classId).map((item)=>{
      const klass=db.classes.find((row)=>row.id===item.class_id);
      return {...item,classLabel:klass?classLabel(klass):'',classlabel:klass?classLabel(klass):''};
    });
  }
  function tracker(classId) {
    const klass=db.classes.find((item)=>item.id===classId);
    if (!klass) return null;
    const students=studentRows(classId).map(({id,name,email})=>({id,name,email}));
    const studentIds=new Set(students.map((item)=>item.id));
    const assignments=assignmentRows(classId);
    const assignmentIds=new Set(assignments.map((item)=>item.id));
    const weeks=db.weeks.filter((item)=>item.class_id===classId);
    const weekIds=new Set(weeks.map((item)=>item.id));
    return {
      class:{...klass,label:classLabel(klass)}, weeks, students, assignments,
      attendance:db.attendance.filter((item)=>studentIds.has(item.student_id)&&weekIds.has(item.week_id)),
      checkins:db.checkins.filter((item)=>studentIds.has(item.student_id)&&weekIds.has(item.week_id)),
      homework:db.homework.filter((item)=>studentIds.has(item.student_id)&&assignmentIds.has(item.assignment_id))
    };
  }
  function match(path, pattern) {
    const p=path.split('/').filter(Boolean), q=pattern.split('/').filter(Boolean);
    if (p.length!==q.length) return null;
    const params={};
    for (let i=0;i<q.length;i+=1) {
      if (q[i].startsWith(':')) params[q[i].slice(1)]=decodeURIComponent(p[i]);
      else if (q[i]!==p[i]) return null;
    }
    return params;
  }
  function updateOrInsert(list, predicate, row) {
    const index=list.findIndex(predicate);
    if(index>=0) list[index]={...list[index],...row};
    else list.push(row);
    return index>=0?list[index]:row;
  }
  function aiCheckin(answers) {
    const win=answers.weeklyWin?`Your weekly win, “${answers.weeklyWin}”, is a strong sign of progress. `:'';
    return `${win}Your understanding and confidence are moving in the right direction. Keep practising one short answer aloud each day, and focus on speaking clearly rather than perfectly.`;
  }
  function aiHomework(answers) {
    const joined=(answers||[]).join('\n');
    const corrections=[];
    if(/Tá mé maith go/i.test(joined)) corrections.push('"Tá mé maith go"\nCorrection: Tá mé go maith');
    if(/Conas tá tú/i.test(joined)) corrections.push('"Conas tá tú"\nCorrection: Conas atá tú?');
    if(/Chuaigh mé scoil/i.test(joined)) corrections.push('"Chuaigh mé scoil"\nCorrection: Chuaigh mé ar scoil');
    return {
      corrections:corrections.length?corrections.join('\n\n'):'No Irish corrections needed.',
      generalFeedback:'Good effort. Your meaning is clear and you are engaging well with the task. Review any corrections above, then read the improved answer aloud once.'
    };
  }

  /* The class feed. Mirrors src/community.js closely enough that the screens
     behave the same here as they do on a server. */
  function previewStudent(user){return user.role==='student'?user:db.users.find((item)=>item.id==='s1');}
  function authorOf(id){
    const row=db.users.find((item)=>item.id===id);
    return row?{id:row.id,name:row.name,role:row.role,avatar:Boolean(row.avatar)}:null;
  }
  function attachmentsOf(threadId){
    return (db.attachments||[]).filter((row)=>row.thread_id===threadId)
      .sort((a,b)=>a.position-b.position)
      .map((row)=>({id:row.id,kind:row.kind,url:row.url,fileName:row.file_name,mimeType:row.mime_type,sizeBytes:row.size_bytes}));
  }
  /* Comments decayed by age, the same shape as the server's HOT_SCORE. */
  function hotScore(threadId,lastActivity){
    const comments=(db.posts||[]).filter((p)=>p.thread_id===threadId&&!p.deleted_at).length;
    const ageHours=(PREVIEW_NOW-new RealDate(lastActivity).getTime())/3600000;
    return comments/Math.pow(2,ageHours/36);
  }
  function likeCount(type,id){return (db.likes||[]).filter((row)=>row.target_type===type&&row.target_id===id).length;}
  function likedBy(type,id,userId){return (db.likes||[]).some((row)=>row.target_type===type&&row.target_id===id&&row.user_id===userId);}
  function categoryName(id){return (db.categories||[]).find((row)=>row.id===id)?.name||null;}
  function categoryRows(classId){
    return (db.categories||[]).filter((row)=>row.class_id===classId)
      .map((row)=>({...row,thread_count:(db.threads||[]).filter((t)=>t.category_id===row.id&&!t.deleted_at).length}))
      .sort((a,b)=>a.position-b.position);
  }
  function threadRows(classId,includeDeleted,viewerId,categoryId,sort,includeScheduled){
    const rows=(db.threads||[]).filter((row)=>row.class_id===classId&&(includeDeleted||!row.deleted_at)
        &&(includeScheduled||new RealDate(row.published_at||row.created_at).getTime()<=PREVIEW_NOW)
        &&(!categoryId||row.category_id===categoryId))
      .map((row)=>{
        const replies=(db.posts||[]).filter((post)=>post.thread_id===row.id&&!post.deleted_at);
        const last=replies[replies.length-1];
        return {...row,author:authorOf(row.author_id),category_name:categoryName(row.category_id),
          attachments:attachmentsOf(row.id),
          scheduled:new RealDate(row.published_at||row.created_at).getTime()>PREVIEW_NOW,
          comment_count:replies.length,like_count:likeCount('thread',row.id),liked:likedBy('thread',row.id,viewerId),
          last_comment:last?{name:authorOf(last.author_id)?.name||'Removed account',at:last.created_at}:null};
      });
    return rows.sort((a,b)=>(Number(b.pinned)-Number(a.pinned))
      ||(sort==='hot'?hotScore(b.id,b.last_activity_at)-hotScore(a.id,a.last_activity_at):0)
      ||((a.published_at||a.created_at)<(b.published_at||b.created_at)?1:-1));
  }
  function threadDetail(id,includeDeleted,viewerId,includeScheduled){
    const row=(db.threads||[]).find((item)=>item.id===id&&(includeDeleted||!item.deleted_at)
      &&(includeScheduled||new RealDate(item.published_at||item.created_at).getTime()<=PREVIEW_NOW));
    if(!row)return null;
    const comments=(db.posts||[]).filter((post)=>post.thread_id===id&&(includeDeleted||!post.deleted_at))
      .map((post)=>({...post,author:authorOf(post.author_id),
        like_count:likeCount('post',post.id),liked:likedBy('post',post.id,viewerId)}));
    return {...row,author:authorOf(row.author_id),category_name:categoryName(row.category_id),
      attachments:attachmentsOf(row.id),
      scheduled:new RealDate(row.published_at||row.created_at).getTime()>PREVIEW_NOW,
      comment_count:comments.filter((c)=>!c.deleted_at).length,
      like_count:likeCount('thread',row.id),liked:likedBy('thread',row.id,viewerId),comments};
  }
  /* Counts what people wrote, not the likes they collected, exactly as
     topContributors does on the server. */
  function contributorRows(classId){
    const threadIds=new Set((db.threads||[]).filter((t)=>t.class_id===classId&&!t.deleted_at).map((t)=>t.id));
    const tally=new Map();
    const add=(id)=>{const user=db.users.find((u)=>u.id===id);if(!user||user.role!=='student')return;
      tally.set(id,(tally.get(id)||0)+1);};
    (db.threads||[]).filter((t)=>t.class_id===classId&&!t.deleted_at).forEach((t)=>add(t.author_id));
    (db.posts||[]).filter((p)=>threadIds.has(p.thread_id)&&!p.deleted_at).forEach((p)=>add(p.author_id));
    return [...tally.entries()]
      .map(([id,total])=>({id,name:db.users.find((u)=>u.id===id)?.name||'',total}))
      .sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)).slice(0,5);
  }
  function boardPayload(classId,includeDeleted,viewerId,url,includeScheduled){
    const categoryId=url.searchParams.get('categoryId')||null;
    const sort=url.searchParams.get('sort')==='hot'?'hot':'new';
    return {threads:threadRows(classId,includeDeleted,viewerId,categoryId,sort,includeScheduled),
      categories:categoryRows(classId),contributors:contributorRows(classId),sort,categoryId,
      memberCount:db.users.filter((u)=>u.role==='student'&&u.class_id===classId&&u.active).length};
  }
  function newThread(classId,authorId,body){
    const now=new RealDate(PREVIEW_NOW).toISOString();
    const row={id:`t${db.counters.thread=(db.counters.thread||10)+1}`,class_id:classId,author_id:authorId,
      title:body.title,body:body.body,category_id:body.categoryId||null,pinned:false,locked:false,
      deleted_at:null,created_at:now,published_at:body.publishedAt||now,last_activity_at:body.publishedAt||now};
    db.threads.push(row);
    (body.attachments||[]).forEach((item,index)=>db.attachments.push({
      id:`at${db.counters.attachment=(db.counters.attachment||20)+1}`,thread_id:row.id,kind:item.kind,url:item.url,
      file_name:item.fileName||null,mime_type:item.mimeType||null,size_bytes:item.sizeBytes||0,position:index}));
    save();return row;
  }
  /* Idempotent both ways, like the server's toggleLike: a double tap on a phone
     is one gesture, not two likes. */
  function toggleLikeRow(userId,type,targetId){
    const target=type==='post'?'post':'thread';
    const existing=(db.likes||[]).find((row)=>row.user_id===userId&&row.target_type===target&&row.target_id===targetId);
    if(existing) db.likes=db.likes.filter((row)=>row!==existing);
    else db.likes.push({user_id:userId,target_type:target,target_id:targetId});
    save();
    return {liked:!existing,likeCount:likeCount(target,targetId)};
  }
  function newReply(threadId,authorId,body){
    const now=new RealDate(PREVIEW_NOW).toISOString();
    const row={id:`p${db.counters.post=(db.counters.post||10)+1}`,thread_id:threadId,author_id:authorId,
      body:body.body,deleted_at:null,created_at:now};
    db.posts.push(row);
    const thread=db.threads.find((item)=>item.id===threadId);
    if(thread)thread.last_activity_at=now;
    save();return row;
  }
  /* Counts what somebody else wrote since this person last opened the board. Your
     own message coming back as "1 new" teaches people to ignore the badge. */
  function previewUnread(student){
    const seen=(db.reads||[]).find((row)=>row.user_id===student.id&&row.class_id===student.class_id);
    const since=seen?new RealDate(seen.last_seen_at).getTime():0;
    const threads=(db.threads||[]).filter((row)=>row.class_id===student.class_id&&!row.deleted_at);
    const threadIds=new Set(threads.map((row)=>row.id));
    return threads.filter((row)=>row.author_id!==student.id&&new RealDate(row.created_at).getTime()>since).length
      +(db.posts||[]).filter((row)=>threadIds.has(row.thread_id)&&!row.deleted_at&&row.author_id!==student.id
        &&new RealDate(row.created_at).getTime()>since).length;
  }

  /* The next sitting of a class, worked out the same way src/classtime.js does it
     on the server: from the class day, time and timezone rather than a stored row. */
  function previewNextClass(klass){
    if(!klass?.day_of_week||!klass?.start_time)return null;
    const [hour,minute]=String(klass.start_time).split(':').map(Number);
    // The preview clock is fixed, so this only has to be right for one instant.
    const now=new RealDate(PREVIEW_NOW);
    const day=now.getUTCDay()===0?7:now.getUTCDay();
    const daysAhead=(Number(klass.day_of_week)-day+7)%7;
    const start=new RealDate(now);
    start.setUTCDate(now.getUTCDate()+daysAhead);
    // Europe/Dublin is UTC+1 in August, so 19:00 local is 18:00 UTC.
    start.setUTCHours(hour-1,minute,0,0);
    if(start.getTime()+120*60000<now.getTime())start.setUTCDate(start.getUTCDate()+7);
    const minutesAway=Math.round((start.getTime()-now.getTime())/60000);
    return {startsAt:start.toISOString(),timezone:klass.timezone||'Europe/Dublin',minutesAway,
      live:minutesAway<=0,soon:minutesAway>0&&minutesAway<=12*60,
      joinUrl:klass.join_url||null,note:klass.join_note||null};
  }

  const originalFetch=window.fetch.bind(window);
  window.fetch=async (input,options={})=>{
    const url=new URL(typeof input==='string'?input:input.url, document.baseURI || location.href);
    if(!url.pathname.startsWith('/api/')) return originalFetch(input,options);
    await new Promise((resolve)=>setTimeout(resolve,65));
    const method=(options.method||'GET').toUpperCase();
    const body=await bodyOf(options);
    const path=url.pathname;
    const user=currentUser();

    if(path==='/api/auth/me') return user?json({user:{id:user.id,name:user.name,email:user.email,role:user.role,mustChangePassword:Boolean(user.mustChangePassword||user.must_change_password)}}):error('Not signed in',401);
    if(path==='/api/auth/login'&&method==='POST'){
      const email=String(body.email||'').toLowerCase();
      const found=db.users.find((item)=>item.email.toLowerCase()===email) || (email.includes('student')?db.users.find((item)=>item.id==='s1'):db.users.find((item)=>item.id==='admin1'));
      db.sessionUserId=found.id; found.mustChangePassword=false; found.must_change_password=false; found.last_login_at=new RealDate(PREVIEW_NOW).toISOString(); save();
      return json({user:{id:found.id,name:found.name,email:found.email,role:found.role,mustChangePassword:false}});
    }
    if(path==='/api/auth/logout'&&method==='POST'){db.sessionUserId=null;save();return json({ok:true});}
    if(path==='/api/auth/forgot-password'&&method==='POST') return json({message:'A preview reset email has been generated.'});
    if(path==='/api/auth/reset-password'&&method==='POST') return json({ok:true});
    if(path==='/api/auth/change-password'&&method==='POST') return json({ok:true});
    if(!user) return error('Not signed in',401);

    if(path==='/api/admin/bootstrap'&&method==='GET') return json({classes:db.classes.map((item)=>({...item,label:classLabel(item),student_count:studentRows(item.id).length})),counts:{students:studentRows().length,assignments:db.assignments.length}});
    if(path==='/api/admin/classes'&&method==='GET') return json(db.classes.map((item)=>({...item,label:classLabel(item),student_count:studentRows(item.id).length})));
    if(path==='/api/admin/classes'&&method==='POST'){
      const id=`c${db.counters.class++}`;const row={id,programme_name:body.programmeName,day_of_week:Number(body.dayOfWeek),start_time:body.startTime,timezone:body.timezone||'Europe/Dublin',active:true,created_at:new RealDate(PREVIEW_NOW).toISOString()};
      row.label=classLabel(row);db.classes.push(row);save();return json(row,201);
    }
    let params=match(path,'/api/admin/classes/:id');
    if(params&&method==='PATCH'){
      const row=db.classes.find((item)=>item.id===params.id);if(!row)return error('Class not found',404);
      if(body.programmeName)row.programme_name=body.programmeName;if(body.dayOfWeek)row.day_of_week=Number(body.dayOfWeek);if(body.startTime)row.start_time=body.startTime;if(body.timezone)row.timezone=body.timezone;if(body.active!==undefined)row.active=body.active;
      if(body.joinUrl!==undefined)row.join_url=body.joinUrl||null;if(body.joinNote!==undefined)row.join_note=body.joinNote||null;
      row.label=classLabel(row);save();return json(row);
    }
    if(path==='/api/admin/students'&&method==='GET') return json(studentRows(url.searchParams.get('classId')));
    if(path==='/api/admin/students'&&method==='POST'){
      const id=`s${db.counters.student++}`;const row={id,role:'student',name:body.name,email:body.email,class_id:body.classId,active:true,must_change_password:true,mustChangePassword:true,last_login_at:null,emailStatus:'sent'};
      db.users.push(row);save();return json(row,201);
    }
    params=match(path,'/api/admin/students/:id');
    if(params&&method==='PATCH'){
      const row=db.users.find((item)=>item.id===params.id);if(!row)return error('Student not found',404);
      Object.assign(row,{...(body.name?{name:body.name}:{}),...(body.email?{email:body.email}:{}),...(body.classId?{class_id:body.classId}:{}),...(body.active!==undefined?{active:body.active}:{})});save();return json({ok:true});
    }
    params=match(path,'/api/admin/students/:id/:action');
    if(params&&method==='POST'&&['resend-invite','reset-password'].includes(params.action)) return json({ok:true,message:params.action==='reset-password'?'A new temporary password was emailed to the student.':'Invitation email sent.'});
    if(path==='/api/admin/students/import'&&method==='POST'){
      const file=body.get('file');const fallbackClass=body.get('classId')||db.classes[0].id;const text=file?await file.text():'';
      const lines=text.trim().split(/\r?\n/).filter(Boolean);const headers=(lines.shift()||'Name,Email,Class').split(',').map((h)=>h.trim().toLowerCase());
      const results=[];
      for(const line of lines){
        const cols=line.split(',').map((v)=>v.trim().replace(/^"|"$/g,''));const obj=Object.fromEntries(headers.map((h,i)=>[h,cols[i]||'']));
        const name=obj.name||obj['student name'];const email=obj.email||obj['email address'];const classText=obj.class||obj.course||'';
        const klass=db.classes.find((item)=>item.id===fallbackClass||classLabel(item).toLowerCase()===classText.toLowerCase())||db.classes[0];
        if(!name||!email){results.push({name,email,status:'error',error:'Missing name or email'});continue;}
        const id=`s${db.counters.student++}`;db.users.push({id,role:'student',name,email,class_id:klass.id,active:true,must_change_password:true,mustChangePassword:true,last_login_at:null});
        results.push({name,email,status:'created',studentId:id,emailStatus:'sent'});
      }
      save();return json({total:results.length,created:results.filter((r)=>r.status==='created').length,results});
    }

    params=match(path,'/api/admin/tracker/:classId');
    if(params&&method==='GET'){const result=tracker(params.classId);return result?json(result):error('Class not found',404);}
    params=match(path,'/api/admin/attendance/:weekId/:studentId');
    if(params&&method==='PUT'){
      const row=updateOrInsert(db.attendance,(item)=>item.week_id===params.weekId&&item.student_id===params.studentId,{id:`at-${params.studentId}-${params.weekId}`,week_id:params.weekId,student_id:params.studentId,status:body.status,minutes:Number(body.minutes||0),notes:body.notes||'',source:'manual'});
      save();return json(row);
    }
    if(path==='/api/admin/attendance/import'&&method==='POST'){
      const classId=body.get('classId'),weekId=body.get('weekId'),threshold=Number(body.get('liveThresholdMinutes')||30),file=body.get('file');
      const text=file?await file.text():'';
      const enrolled=studentRows(classId);const totals=new Map();const unmatched=[];
      const lines=text.trim().split(/\r?\n/).filter(Boolean);const headers=(lines.shift()||'Name,Email,Duration').split(',').map((h)=>h.toLowerCase());
      for(const line of lines){
        const cols=line.split(',').map((v)=>v.trim().replace(/^"|"$/g,''));const obj=Object.fromEntries(headers.map((h,i)=>[h,cols[i]||'']));
        const email=obj.email||obj['user email']||'';const name=obj.name||obj.participant||obj['user name']||'';const minutes=parseInt(obj.duration||obj.minutes||obj['time in session']||'0',10)||0;
        const student=enrolled.find((item)=>item.email.toLowerCase()===email.toLowerCase())||enrolled.find((item)=>item.name.toLowerCase()===name.toLowerCase());
        if(!student){unmatched.push({name,email,matched:false});continue;}totals.set(student.id,(totals.get(student.id)||0)+minutes);
      }
      const rows=enrolled.map((student)=>{
        const minutes=totals.get(student.id)||0,status=minutes>=threshold?'live':minutes>0?'partial':'missed';
        updateOrInsert(db.attendance,(item)=>item.week_id===weekId&&item.student_id===student.id,{id:`at-${student.id}-${weekId}`,week_id:weekId,student_id:student.id,status,minutes,source:'csv'});
        return{name:student.name,email:student.email,matched:true,status,minutes};
      }).concat(unmatched);save();return json({rows});
    }
    if(path==='/api/admin/uploads'&&method==='POST'){
      const files=body.getAll('files').map((file)=>({fileName:file.name,mimeType:file.type||'application/octet-stream',url:URL.createObjectURL(file),fileUrl:URL.createObjectURL(file)}));
      return json({files},201);
    }
    if(path==='/api/admin/assignments'&&method==='GET'){
      const rows=assignmentRows(url.searchParams.get('classId'));
      return json(url.searchParams.get('includeArchived')==='true'?rows:rows.filter((r)=>r.status!=='archived'));
    }
    if(path==='/api/admin/assignments'&&method==='POST'){
      const id=`a${db.counters.assignment++}`;const row={id,allow_uploads:Boolean(body.allowUploads),uploads_required:Boolean(body.uploadsRequired),accepted_file_types:body.acceptedFileTypes||['image','pdf'],max_files:Number(body.maxFiles)||3,class_id:body.classId,week_id:body.weekId||null,title:body.title,instructions:body.instructions||'',loom_url:body.loomUrl||null,visible_at:body.visibleAt,deadline_at:body.deadlineAt,reopened_until:null,hard_deadline:Boolean(body.hardDeadline),reminders_enabled:Boolean(body.remindersEnabled),status:body.status||'published',questions:(body.questions||[]).map((q,i)=>({id:`q-${id}-${i}`,position:i,...q})),resources:body.resources||[]};
      db.assignments.push(row);save();return json(row,201);
    }
    params=match(path,'/api/admin/assignments/:id');
    if(params&&method==='PUT'){
      const row=db.assignments.find((item)=>item.id===params.id);if(!row)return error('Assignment not found',404);
      Object.assign(row,{title:body.title,instructions:body.instructions,loom_url:body.loomUrl||null,visible_at:body.visibleAt,deadline_at:body.deadlineAt,hard_deadline:Boolean(body.hardDeadline),reminders_enabled:Boolean(body.remindersEnabled),status:body.status,questions:(body.questions||[]).map((q,i)=>({id:`q-${row.id}-${i}`,position:i,...q})),resources:body.resources||[]});save();return json({ok:true});
    }
    params=match(path,'/api/admin/assignments/:id/reopen');
    if(params&&method==='POST'){const row=db.assignments.find((item)=>item.id===params.id);if(!row)return error('Assignment not found',404);row.reopened_until=body.reopenedUntil;save();return json(row);}
    params=match(path,'/api/admin/weeks/:id/checkin');
    if(params&&method==='PUT'){const row=db.weeks.find((item)=>item.id===params.id);if(!row)return error('Week not found',404);row.checkin_enabled=Boolean(body.enabled);save();return json(row);}

    params=match(path,'/api/admin/checkins/:id/feedback-draft');
    if(params&&method==='PATCH'){const row=db.checkins.find((item)=>item.id===params.id);if(!row)return error('Check-in not found',404);row.teacher_feedback=body.feedback;row.feedback_state=row.status==='returned'?'returned':'teacher_edited';save();return json(row);}
    params=match(path,'/api/admin/checkins/:id/return');
    if(params&&method==='POST'){const row=db.checkins.find((item)=>item.id===params.id);if(!row)return error('Check-in not found',404);Object.assign(row,{teacher_feedback:body.feedback,status:'returned',feedback_state:'returned',feedback_returned_at:new RealDate(PREVIEW_NOW).toISOString(),feedback_read_at:null});save();return json(row);}
    params=match(path,'/api/admin/checkins/:id/redraft');
    if(params&&method==='POST'){const row=db.checkins.find((item)=>item.id===params.id);if(!row)return error('Check-in not found',404);row.ai_feedback=aiCheckin(row.answers||{});row.teacher_feedback=row.ai_feedback;row.feedback_state='ai_drafted';save();return json(row);}
    params=match(path,'/api/admin/homework/:id/feedback-draft');
    if(params&&method==='PATCH'){const row=db.homework.find((item)=>item.id===params.id);if(!row)return error('Homework not found',404);row.teacher_corrections=body.corrections;row.teacher_general_feedback=body.generalFeedback;row.feedback_state=row.status==='returned'?'returned':'teacher_edited';save();return json(row);}
    params=match(path,'/api/admin/homework/:id/return');
    if(params&&method==='POST'){const row=db.homework.find((item)=>item.id===params.id);if(!row)return error('Homework not found',404);Object.assign(row,{teacher_corrections:body.corrections,teacher_general_feedback:body.generalFeedback,status:'returned',feedback_state:'returned',feedback_returned_at:new RealDate(PREVIEW_NOW).toISOString(),feedback_read_at:null});save();return json(row);}
    params=match(path,'/api/admin/homework/:id/redraft');
    if(params&&method==='POST'){const row=db.homework.find((item)=>item.id===params.id);if(!row)return error('Homework not found',404);const feedback=aiHomework(row.answers||[]);Object.assign(row,{ai_corrections:feedback.corrections,teacher_corrections:feedback.corrections,ai_general_feedback:feedback.generalFeedback,teacher_general_feedback:feedback.generalFeedback,feedback_state:'ai_drafted'});save();return json(row);}
    if(path==='/api/admin/reminders/run'&&method==='POST') return json({ok:true,sent:3});

    // --- Voice: dictation and voice notes -------------------------------------
    // The preview has no server, so dictation returns a worked example instead of
    // calling OpenAI, and voice notes are kept as object URLs for this session.
    if(path==='/api/admin/dictate'&&method==='POST'){
      const mode=(body instanceof FormData?body.get('mode'):body.mode)||'full';
      const sample=mode==='light'
        ? '"Bhí mé ag dul go dtí an siopa."\nCorrection: Bhí mé ag dul chuig an siopa.'
        : 'Really strong work this week. Your conditional forms are much steadier than they were a fortnight ago.\n\nThe one thing to watch is the genitive after compound prepositions. Try five sentences with "in aice le" before Thursday and bring them to class.';
      return json({text:sample, raw:sample, cleaned:true, preview:true});
    }
    params=match(path,'/api/admin/voice-note/:type/:id');
    if(params&&(method==='POST'||method==='DELETE')&&(params.type==='checkin'||params.type==='homework')){
      const collection=params.type==='checkin'?db.checkins:db.homework;
      const row=collection.find((item)=>item.id===params.id);
      if(!row)return error('Not found',404);
      if(method==='DELETE'){
        if(row.voice_note?.url?.startsWith('blob:')) URL.revokeObjectURL(row.voice_note.url);
        row.voice_note=null; save(); return json(deepCopy({...row,voice_note:null}));
      }
      const file=body instanceof FormData?body.get('audio'):null;
      const seconds=Number(body instanceof FormData?body.get('seconds'):0)||0;
      row.voice_note={
        url:file?URL.createObjectURL(file):'',
        mime:file?.type||'audio/webm',
        seconds,
        recordedAt:new RealDate(PREVIEW_NOW).toISOString(),
      };
      save();
      return json({...deepCopy({...row,voice_note:null}),voice_note:row.voice_note},201);
    }

    // --- Student profile and private notes ------------------------------------
    params=match(path,'/api/admin/students/:id/profile');
    if(params&&method==='GET'){
      const student=db.users.find((item)=>item.id===params.id);
      if(!student)return error('Student not found',404);
      const klass=db.classes.find((item)=>item.id===student.class_id);
      const attendance=db.attendance.filter((item)=>item.student_id===student.id);
      const checkins=db.checkins.filter((item)=>item.student_id===student.id&&item.status!=='draft');
      const homework=db.homework.filter((item)=>item.student_id===student.id&&item.status!=='draft');
      const avg=(key)=>{
        const values=checkins.map((item)=>Number(item.answers?.[key])).filter((value)=>Number.isFinite(value));
        return values.length?Math.round((values.reduce((a,b)=>a+b,0)/values.length)*10)/10:null;
      };
      return json({
        student:{...student, class_id:student.class_id, classLabel:klass?classLabel(klass):null},
        notes:deepCopy(db.notes.filter((item)=>item.student_id===student.id)),
        stats:{
          live_weeks:attendance.filter((item)=>item.status==='live').length,
          recorded_weeks:attendance.filter((item)=>item.status!=='unknown').length,
          checkins_submitted:checkins.length,
          homework_submitted:homework.length,
          avg_understanding:avg('understanding'),
          avg_confidence:avg('confidence'),
        },
      });
    }
    params=match(path,'/api/admin/students/:id/notes');
    if(params&&method==='POST'){
      const note={id:`note-${db.notes.length+1}-${Math.round(PREVIEW_NOW/1000)}`,student_id:params.id,author_id:user.id,author_name:user.name,body:String(body.body||''),pinned:Boolean(body.pinned),created_at:new RealDate(PREVIEW_NOW).toISOString(),updated_at:new RealDate(PREVIEW_NOW).toISOString()};
      db.notes.unshift(note); save(); return json(note,201);
    }
    params=match(path,'/api/admin/notes/:noteId');
    if(params&&method==='PATCH'){
      const note=db.notes.find((item)=>item.id===params.noteId);
      if(!note)return error('Note not found',404);
      if(body.body!==undefined)note.body=body.body;
      if(body.pinned!==undefined)note.pinned=Boolean(body.pinned);
      save(); return json(note);
    }
    if(params&&method==='DELETE'){
      db.notes=db.notes.filter((item)=>item.id!==params.noteId); save(); return json(null,204);
    }

    // --- Homework calendar, archive, delete ------------------------------------
    if(path==='/api/admin/teaching-weeks'&&method==='GET'){
      const wanted=url.searchParams.get('classId');
      return json(db.weeks.filter((w)=>!wanted||w.class_id===wanted).map((week)=>{const klass=db.classes.find((c)=>c.id===week.class_id);return {...week, classLabel:klass?classLabel(klass):null};}));
    }
    params=match(path,'/api/admin/assignments/:id/impact');
    if(params&&method==='GET'){
      const assignment=db.assignments.find((item)=>item.id===params.id);
      if(!assignment)return error('Assignment not found',404);
      const rows=db.homework.filter((item)=>item.assignment_id===params.id);
      return json({assignment:{id:assignment.id,title:assignment.title,status:assignment.status},
        submissions:rows.filter((r)=>r.status!=='draft').length,
        returned:rows.filter((r)=>r.status==='returned').length,
        drafts:rows.filter((r)=>r.status==='draft').length});
    }
    params=match(path,'/api/admin/assignments/:id/archive');
    if(params&&method==='POST'){
      const assignment=db.assignments.find((item)=>item.id===params.id);
      if(!assignment)return error('Assignment not found',404);
      const archived=body.archived!==false;
      assignment.status=archived?'archived':'published';
      assignment.archived_at=archived?new RealDate(PREVIEW_NOW).toISOString():null;
      save(); return json(assignment);
    }
    params=match(path,'/api/admin/assignments/:id');
    if(params&&method==='DELETE'){
      const assignment=db.assignments.find((item)=>item.id===params.id);
      if(!assignment)return error('Assignment not found',404);
      const submissions=db.homework.filter((item)=>item.assignment_id===params.id&&item.status!=='draft').length;
      const confirmed=Number(url.searchParams.get('confirmSubmissions')??-1);
      if(submissions>0&&confirmed!==submissions){
        return json({error:`“${assignment.title}” has ${submissions} student submission${submissions===1?'':'s'}. Deleting removes ${submissions===1?'it':'them'} permanently. Archive it instead to keep the work.`,submissions},409);
      }
      db.assignments=db.assignments.filter((item)=>item.id!==params.id);
      db.homework=db.homework.filter((item)=>item.assignment_id!==params.id);
      save(); return json({ok:true,deletedSubmissions:submissions});
    }
    params=match(path,'/api/admin/classes/:id/impact');
    if(params&&method==='GET'){
      const klass=db.classes.find((item)=>item.id===params.id);
      if(!klass)return error('Class not found',404);
      const weekIds=new Set(db.weeks.filter((w)=>w.class_id===params.id).map((w)=>w.id));
      const assignmentIds=new Set(db.assignments.filter((a)=>a.class_id===params.id).map((a)=>a.id));
      return json({class:{...klass,label:classLabel(klass)},
        students:db.users.filter((u)=>u.role==='student'&&u.class_id===params.id&&u.active).length,
        weeks:weekIds.size, assignments:assignmentIds.size,
        attendance:db.attendance.filter((a)=>weekIds.has(a.week_id)&&a.status!=='unknown').length,
        checkins:db.checkins.filter((c)=>weekIds.has(c.week_id)&&c.status!=='draft').length,
        submissions:db.homework.filter((h)=>assignmentIds.has(h.assignment_id)&&h.status!=='draft').length});
    }
    params=match(path,'/api/admin/classes/:id');
    if(params&&method==='DELETE'){
      const klass=db.classes.find((item)=>item.id===params.id);
      if(!klass)return error('Class not found',404);
      const weekIds=new Set(db.weeks.filter((w)=>w.class_id===params.id).map((w)=>w.id));
      const assignmentIds=new Set(db.assignments.filter((a)=>a.class_id===params.id).map((a)=>a.id));
      const work=db.checkins.filter((c)=>weekIds.has(c.week_id)&&c.status!=='draft').length
        + db.homework.filter((h)=>assignmentIds.has(h.assignment_id)&&h.status!=='draft').length;
      const confirmed=Number(url.searchParams.get('confirmWork')??-1);
      if(work>0&&confirmed!==work) return json({error:`“${classLabel(klass)}” holds ${work} piece${work===1?'':'s'} of student work. Deleting removes ${work===1?'it':'them'} permanently. Close the class instead to keep everything.`,work},409);
      db.classes=db.classes.filter((item)=>item.id!==params.id);
      db.weeks=db.weeks.filter((w)=>w.class_id!==params.id);
      db.assignments=db.assignments.filter((a)=>a.class_id!==params.id);
      db.attendance=db.attendance.filter((a)=>!weekIds.has(a.week_id));
      db.checkins=db.checkins.filter((c)=>!weekIds.has(c.week_id));
      db.homework=db.homework.filter((h)=>!assignmentIds.has(h.assignment_id));
      db.users.forEach((u)=>{if(u.class_id===params.id)u.class_id=null;});
      save(); return json({ok:true,deletedWork:work});
    }
    if((path==='/api/admin/calendar-feed'||path==='/api/student/calendar-feed')&&method==='GET'){
      return json({url:`${location.origin}/calendar/preview-demo-token-not-a-real-feed.ics`,token:'preview-demo-token-not-a-real-feed',preview:true});
    }
    if((path==='/api/admin/calendar-feed/rotate'||path==='/api/student/calendar-feed/rotate')&&method==='POST'){
      return json({url:`${location.origin}/calendar/preview-demo-token-rotated-example.ics`,token:'preview-demo-token-rotated-example',preview:true});
    }

    // --- Check-in scheduling and nudges ----------------------------------------
    params=match(path,'/api/admin/weeks/:id/checkin');
    if(params&&method==='PUT'){
      const week=db.weeks.find((item)=>item.id===params.id);
      if(!week)return error('Week not found',404);
      if(body.enabled!==undefined)week.checkin_enabled=Boolean(body.enabled);
      if(body.releaseAt)week.checkin_release_at=body.releaseAt;
      if(body.dueAt)week.checkin_due_at=body.dueAt;
      if(body.hardDeadline!==undefined)week.checkin_hard_deadline=Boolean(body.hardDeadline);
      if(body.label!==undefined)week.label=body.label;
      save(); return json(week);
    }
    params=match(path,'/api/admin/classes/:id/checkin-schedule');
    if(params&&method==='POST'){
      const klass=db.classes.find((item)=>item.id===params.id);
      if(!klass)return error('Class not found',404);
      const toMonday=(value)=>{const d=new RealDate(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d;};
      const first=toMonday(body.startDate), last=toMonday(body.endDate);
      const skip=new Set(body.skipWeekStarts||[]);
      let created=0, total=0, skipped=0;
      for(let cur=first; cur<=last; cur=new RealDate(cur.getTime()+7*86400000)){
        const iso=cur.toISOString().slice(0,10);
        const rel=new RealDate(cur.getTime()+((body.releaseDay||5)-1)*86400000);
        rel.setUTCHours(body.releaseHour??14, body.releaseMinute??0, 0, 0);
        const due=new RealDate(cur.getTime()+((body.dueDay||7)-1)*86400000);
        due.setUTCHours(body.dueHour??20, body.dueMinute??0, 0, 0);
        const enabled=!skip.has(iso);
        total++; if(!enabled)skipped++;
        let week=db.weeks.find((w)=>w.class_id===params.id&&String(w.week_start).slice(0,10)===iso);
        if(!week){week={id:`w-${params.id}-${iso}`,class_id:params.id,week_start:iso};db.weeks.push(week);created++;}
        week.checkin_release_at=rel.toISOString();
        week.checkin_due_at=due.toISOString();
        week.checkin_enabled=enabled;
        week.checkin_hard_deadline=body.hardDeadline!==false;
      }
      db.weeks.sort((a,b)=>String(a.week_start).localeCompare(String(b.week_start)));
      save();
      return json({total,created,updated:total-created,skipped});
    }
    if(path==='/api/admin/weeks/bulk-checkin'&&method==='POST'){
      const ids=new Set(body.weekIds||[]);
      let updated=0;
      db.weeks.forEach((week)=>{if(ids.has(week.id)){week.checkin_enabled=Boolean(body.enabled);updated++;}});
      save(); return json({updated});
    }
    if(path==='/api/admin/nudge'&&method==='POST'){
      const student=db.users.find((item)=>item.id===body.studentId);
      if(!student)return error('Student not found',404);
      db.nudges=db.nudges||[];
      db.nudges.push({studentId:body.studentId,type:body.type,weekId:body.weekId||null,assignmentId:body.assignmentId||null,at:new RealDate(PREVIEW_NOW).toISOString()});
      save();
      return json({ok:true,status:'simulated',to:student.email});
    }
    if(path==='/api/admin/nudge/history'&&method==='GET'){
      const list=(db.nudges||[]).filter((n)=>n.studentId===url.searchParams.get('studentId')&&n.type===url.searchParams.get('type'));
      return json({lastSentAt:list.length?list[list.length-1].at:null});
    }

    // --- Course withdrawal and engagement --------------------------------------
    if(path==='/api/student/withdrawal'&&method==='GET'){
      const student=user;
      const row=(db.withdrawals||[]).find((w)=>w.student_id===student.id)||null;
      return json({withdrawnAt:student.withdrawn_at||null,response:row});
    }
    if(path==='/api/student/withdrawal'&&method==='POST'){
      const student=user;
      if(student.withdrawn_at)return error('You have already withdrawn from this course.',409);
      const row={id:`wd-${student.id}`,student_id:student.id,class_id:student.class_id,reason:body.reason,detail:body.detail||'',
        overall_rating:body.overallRating||null,teaching_rating:body.teachingRating||null,materials_rating:body.materialsRating||null,
        pace:body.pace||'',what_worked:body.whatWorked||'',what_to_improve:body.whatToImprove||'',
        would_recommend:body.wouldRecommend||'',may_contact:Boolean(body.mayContact),submitted_at:new RealDate(PREVIEW_NOW).toISOString()};
      db.withdrawals=(db.withdrawals||[]).filter((w)=>w.student_id!==student.id);
      db.withdrawals.push(row);
      student.withdrawn_at=row.submitted_at;
      save();
      return json({ok:true,withdrawnAt:student.withdrawn_at,response:row},201);
    }
    params=match(path,'/api/admin/engagement/:classId');
    if(params&&method==='GET'){
      const klass=db.classes.find((c)=>c.id===params.classId);
      if(!klass)return error('Class not found',404);
      const enrolled=db.users.filter((u)=>u.role==='student'&&u.active&&u.class_id===params.classId);
      const active=enrolled.filter((u)=>!u.withdrawn_at);
      const activeIds=new Set(active.map((u)=>u.id));
      const dueWeeks=db.weeks.filter((w)=>w.class_id===params.classId&&w.checkin_enabled!==false&&new RealDate(w.checkin_release_at)<=new RealDate(PREVIEW_NOW));
      const dueAssignments=db.assignments.filter((a)=>a.class_id===params.classId&&a.status==='published'&&new RealDate(a.visible_at)<=new RealDate(PREVIEW_NOW));
      const weekIds=new Set(dueWeeks.map((w)=>w.id));
      const assignmentIds=new Set(dueAssignments.map((a)=>a.id));
      const expectedCount=(dueWeeks.length+dueAssignments.length)*active.length;
      const submitted=db.checkins.filter((c)=>weekIds.has(c.week_id)&&activeIds.has(c.student_id)&&c.status!=='draft').length
        + db.homework.filter((h)=>assignmentIds.has(h.assignment_id)&&activeIds.has(h.student_id)&&h.status!=='draft').length;
      const withdrawals=(db.withdrawals||[]).filter((w)=>w.class_id===params.classId).map((w)=>{
        const u=db.users.find((x)=>x.id===w.student_id);return {...w,name:u?.name,email:u?.email};});
      const rate=(done,all)=>all?Math.round((done/all)*100):null;
      const missingFor=(has)=>active.filter((u)=>!has(u.id)).map((u)=>({id:u.id,name:u.name}));
      const items=[
        ...dueWeeks.map((w)=>{
          const has=(id)=>db.checkins.some((c)=>c.week_id===w.id&&c.student_id===id&&c.status!=='draft');
          const done=active.filter((u)=>has(u.id)).length;
          return {kind:'checkin',id:w.id,label:w.label||null,weekStart:w.week_start,dueAt:w.checkin_due_at,
            expected:active.length,submitted:done,rate:rate(done,active.length),missing:missingFor(has)};
        }),
        ...dueAssignments.map((a)=>{
          const has=(id)=>db.homework.some((h)=>h.assignment_id===a.id&&h.student_id===id&&h.status!=='draft');
          const done=active.filter((u)=>has(u.id)).length;
          return {kind:'homework',id:a.id,label:a.title,dueAt:a.reopened_until||a.deadline_at,
            expected:active.length,submitted:done,rate:rate(done,active.length),missing:missingFor(has)};
        }),
      ].sort((a,b)=>new RealDate(b.dueAt)-new RealDate(a.dueAt));
      return json({class:{...klass,label:classLabel(klass)},
        people:{total:enrolled.length,active:active.length,withdrawn:enrolled.length-active.length},
        expected:{expected:expectedCount,submitted,checkins_due:dueWeeks.length,assignments_due:dueAssignments.length},
        retention:enrolled.length?Math.round((active.length/enrolled.length)*100):null,
        completion:expectedCount?Math.round((submitted/expectedCount)*100):null,
        items,
        withdrawals});
    }

    // --- Uploaded homework -----------------------------------------------------
    // The preview has no server to read a file, so uploads are recorded and shown
    // but the transcription step is marked as not read.
    params=match(path,'/api/student/assignments/:id/files');
    if(params&&method==='POST'){
      const assignment=db.assignments.find((a)=>a.id===params.id);
      if(!assignment)return error('Assignment not found',404);
      if(!assignment.allow_uploads)return error('This assignment does not accept uploads.',409);
      const file=body instanceof FormData?body.get('file'):null;
      if(!file)return error('Choose a file to upload.',400);
      db.homeworkFiles=db.homeworkFiles||[];
      const row={id:`hf-${db.homeworkFiles.length+1}-${Math.round(PREVIEW_NOW/1000)}`,assignment_id:params.id,student_id:user.id,
        fileName:file.name,mimeType:file.type,sizeBytes:file.size,extractionState:'pending'};
      db.homeworkFiles.push(row); save();
      return json(row,201);
    }
    params=match(path,'/api/student/files/:fileId');
    if(params&&method==='DELETE'){
      db.homeworkFiles=(db.homeworkFiles||[]).filter((f)=>f.id!==params.fileId); save();
      return json(null,204);
    }

    if(path==='/api/gifs'&&method==='GET'){
      /* The preview has no Giphy key and no network, so it answers with a small
         fixed set. Enough to see the picker and the way a chosen GIF lands in a
         post; a real deployment searches Giphy through the server. */
      const swatch=(hue)=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="hsl(${hue} 70% 62%)"/><text x="100" y="112" font-family="system-ui" font-size="30" font-weight="700" fill="white" text-anchor="middle">GIF</text></svg>`)}`;
      const results=[0,40,90,140,190,240,290,330].map((hue,index)=>({
        id:`gif${index}`,title:'Preview GIF',preview:swatch(hue),url:swatch(hue),width:200,height:200}));
      return json({configured:true,results});
    }
    if(path==='/api/auth/avatar'&&method==='POST'){
      const user=currentUser();if(user){user.avatar=true;user.mustSetAvatar=false;save();}
      return json({ok:true},201);
    }
    if(path==='/api/settings'&&method==='GET') return json(deepCopy(db.settings));
    if(path==='/api/settings/nudge'&&method==='PUT'){db.settings.nudge={...db.settings.nudge,...body};save();return json(db.settings.nudge);}
    if(path==='/api/settings/reminders'&&method==='PUT'){db.settings.reminders={...db.settings.reminders,...body};save();return json(db.settings.reminders);}
    if(path==='/api/settings/email'&&method==='PUT'){db.settings.email={...db.settings.email,...body,configured:true};save();return json(db.settings.email);}
    if(path==='/api/settings/email/test'&&method==='POST') return json({ok:true,message:`Test email prepared for ${body.to}`});
    if(path==='/api/settings/dictation'&&method==='PUT'){
      const {cleanupPrompt,lightPrompt,...dictation}=body;
      db.settings.dictation=dictation; db.settings.voicePrompts={cleanupPrompt,lightPrompt}; save();
      return json({...dictation,cleanupPrompt,lightPrompt});
    }
    if(path==='/api/settings/openai'&&method==='PUT'){db.settings.openai={...db.settings.openai,...body,configured:true};save();return json(db.settings.openai);}
    if(path==='/api/settings/prompts'&&method==='PUT'){db.settings.prompts={...db.settings.prompts,...body};save();return json(db.settings.prompts);}
    if(path==='/api/settings/openai/test'&&method==='POST') return json({ok:true,preview:'Great work this week. Your confidence is improving, and your weekly win shows genuine progress. Keep using one short Irish phrase aloud each day.'});

    if(path==='/api/student/bootstrap'&&method==='GET'){
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');
      const klass=db.classes.find((item)=>item.id===student.class_id);
      const monday='2026-08-03';
      const weeks=db.weeks.filter((item)=>item.class_id===klass.id&&item.week_start<=monday).map((item)=>({...item,checkin_available:PREVIEW_NOW>=new RealDate(item.checkin_release_at).getTime()}));
      const weekIds=new Set(weeks.map((item)=>item.id));const assignments=db.assignments.filter((item)=>item.class_id===klass.id&&new RealDate(item.visible_at).getTime()<=PREVIEW_NOW);
      const assignmentIds=new Set(assignments.map((item)=>item.id));
      const checkins=db.checkins.filter((item)=>item.student_id===student.id&&weekIds.has(item.week_id));
      const homework=db.homework.filter((item)=>item.student_id===student.id&&assignmentIds.has(item.assignment_id));
      const notifications=checkins.filter((item)=>item.status==='returned'&&!item.feedback_read_at).length+homework.filter((item)=>item.status==='returned'&&!item.feedback_read_at).length;
      return json({student,withdrawnAt:student.withdrawn_at||null,class:{...klass,label:classLabel(klass)},weeks,attendance:db.attendance.filter((item)=>item.student_id===student.id&&weekIds.has(item.week_id)),checkins,assignments,homework:homework.map((h)=>({...h,files:(db.homeworkFiles||[]).filter((f)=>f.assignment_id===h.assignment_id&&f.student_id===student.id)})),notifications,nextClass:previewNextClass(klass),communityUnread:previewUnread(student),progress:previewProgress(checkins,homework),dismissals:(db.dismissals||[]).filter((d)=>d.student_id===student.id).map((d)=>({kind:d.kind,refId:d.ref_id})),serverNow:new RealDate(PREVIEW_NOW).toISOString()});
    }
    if(path==='/api/student/dismissals'&&method==='POST'){
      const student=user.role==='student'?user:db.users.find((u)=>u.id==='s1');
      const kind=body?.kind, refId=body?.refId;
      if(kind!=='checkin'&&kind!=='homework')return error('Say which deadline to dismiss.',400);
      // Only work that has closed and was never handed in can be cleared.
      let clearable=false;
      if(kind==='checkin'){
        const w=db.weeks.find((x)=>x.id===refId);
        clearable=Boolean(w&&w.checkin_enabled!==false&&w.checkin_hard_deadline!==false
          &&new RealDate(w.checkin_due_at).getTime()<PREVIEW_NOW
          &&!db.checkins.some((c)=>c.week_id===w.id&&c.student_id===student.id&&c.status!=='draft'));
      } else {
        const a=db.assignments.find((x)=>x.id===refId);
        clearable=Boolean(a&&a.status==='published'&&a.hard_deadline!==false
          &&new RealDate(a.reopened_until||a.deadline_at).getTime()<PREVIEW_NOW
          &&!db.homework.some((h)=>h.assignment_id===a.id&&h.student_id===student.id&&h.status!=='draft'));
      }
      if(!clearable)return error('Only a missed deadline that has closed can be cleared.',409);
      db.dismissals=db.dismissals||[];
      if(!db.dismissals.some((d)=>d.student_id===student.id&&d.kind===kind&&d.ref_id===refId))
        db.dismissals.push({student_id:student.id,kind,ref_id:refId,dismissed_at:new RealDate(PREVIEW_NOW).toISOString()});
      save();
      return json({ok:true,kind,refId},201);
    }
    params=match(path,'/api/student/dismissals/:kind/:refId');
    if(params&&method==='DELETE'){
      const student=user.role==='student'?user:db.users.find((u)=>u.id==='s1');
      db.dismissals=(db.dismissals||[]).filter((d)=>!(d.student_id===student.id&&d.kind===params.kind&&d.ref_id===params.refId));
      save();
      return new Response(null,{status:204});
    }
    params=match(path,'/api/student/checkins/:weekId/draft');
    if(params&&method==='PUT'){
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');
      const row=updateOrInsert(db.checkins,(item)=>item.week_id===params.weekId&&item.student_id===student.id,{id:`ch-${student.id}-${params.weekId}`,week_id:params.weekId,student_id:student.id,status:'draft',answers:body.answers||{},feedback_state:'none'});save();return json(row);
    }
    params=match(path,'/api/student/checkins/:weekId/submit');
    if(params&&method==='POST'){
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');const feedback=aiCheckin(body.answers||{});
      const row=updateOrInsert(db.checkins,(item)=>item.week_id===params.weekId&&item.student_id===student.id,{id:`ch-${student.id}-${params.weekId}`,week_id:params.weekId,student_id:student.id,status:'submitted',answers:body.answers||{},submitted_at:new RealDate(PREVIEW_NOW).toISOString(),ai_feedback:feedback,teacher_feedback:feedback,feedback_state:'ai_drafted',feedback_returned_at:null,feedback_read_at:null});save();return json(row);
    }
    params=match(path,'/api/student/checkins/:id/read-feedback');
    if(params&&method==='POST'){const row=db.checkins.find((item)=>item.id===params.id);if(!row)return error('Feedback not found',404);row.feedback_read_at=new RealDate(PREVIEW_NOW).toISOString();save();return json(row);}
    params=match(path,'/api/student/assignments/:id');
    if(params&&method==='GET'){
      const assignment=db.assignments.find((item)=>item.id===params.id);if(!assignment)return error('Assignment not found',404);
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');const submission=db.homework.find((item)=>item.assignment_id===assignment.id&&item.student_id===student.id)||null;
      return json({assignment:{...assignment,open:true},submission});
    }
    params=match(path,'/api/student/assignments/:id/draft');
    if(params&&method==='PUT'){
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');
      const row=updateOrInsert(db.homework,(item)=>item.assignment_id===params.id&&item.student_id===student.id,{id:`hw-${student.id}-${params.id}`,assignment_id:params.id,student_id:student.id,status:'draft',answers:body.answers||[],current_question:Number(body.currentQuestion||0),feedback_state:'none'});save();return json(row);
    }
    params=match(path,'/api/student/assignments/:id/submit');
    if(params&&method==='POST'){
      const student=user.role==='student'?user:db.users.find((item)=>item.id==='s1');const feedback=aiHomework(body.answers||[]);
      const row=updateOrInsert(db.homework,(item)=>item.assignment_id===params.id&&item.student_id===student.id,{id:`hw-${student.id}-${params.id}`,assignment_id:params.id,student_id:student.id,status:'submitted',answers:body.answers||[],current_question:Math.max(0,(body.answers||[]).length-1),submitted_at:new RealDate(PREVIEW_NOW).toISOString(),ai_corrections:feedback.corrections,teacher_corrections:feedback.corrections,ai_general_feedback:feedback.generalFeedback,teacher_general_feedback:feedback.generalFeedback,feedback_state:'ai_drafted',feedback_returned_at:null,feedback_read_at:null});save();return json(row);
    }
    params=match(path,'/api/student/homework/:id/read-feedback');
    if(params&&method==='POST'){const row=db.homework.find((item)=>item.id===params.id);if(!row)return error('Feedback not found',404);row.feedback_read_at=new RealDate(PREVIEW_NOW).toISOString();save();return json(row);}

    params=match(path,'/api/admin/community/:classId');
    if(params&&method==='GET'&&params.classId!=='thread'&&params.classId!=='post'){
      const klass=db.classes.find((item)=>item.id===params.classId);if(!klass)return error('Class not found',404);
      return json({class:{...klass,label:classLabel(klass)},...boardPayload(params.classId,true,user.id,url,true)});
    }
    params=match(path,'/api/admin/community/thread/:id/schedule');
    if(params&&method==='PATCH'){
      const row=db.threads.find((item)=>item.id===params.id);if(!row)return error('Post not found',404);
      row.published_at=body.publishedAt;row.last_activity_at=body.publishedAt;save();return json(row);
    }
    if(path==='/api/admin/community/attachments'&&method==='POST'){
      const file=body.get&&body.get('file');
      return json({kind:'file',url:file?URL.createObjectURL(file):'#',storedName:'preview',
        fileName:file?file.name:'Attachment.pdf',mimeType:'application/pdf',sizeBytes:file?file.size:0},201);
    }
    params=match(path,'/api/admin/community/like/:type/:id');
    if(params&&method==='POST') return json(toggleLikeRow(user.id,params.type,params.id));
    params=match(path,'/api/admin/community/:classId/categories');
    if(params&&method==='GET') return json(categoryRows(params.classId));
    if(params&&method==='POST'){
      if((db.categories||[]).some((row)=>row.class_id===params.classId&&row.name===body.name))
        return error('That category already exists.',409);
      const row={id:`cat${db.counters.category=(db.counters.category||10)+1}`,class_id:params.classId,
        name:body.name,position:categoryRows(params.classId).length};
      db.categories.push(row);save();return json(row,201);
    }
    params=match(path,'/api/admin/community/categories/:id');
    if(params&&method==='DELETE'){
      db.categories=(db.categories||[]).filter((row)=>row.id!==params.id);
      // Posts survive their category; they simply become uncategorised.
      (db.threads||[]).forEach((row)=>{if(row.category_id===params.id)row.category_id=null;});
      save();return new Response(null,{status:204});
    }
    params=match(path,'/api/admin/community/thread/:id');
    if(params&&method==='GET'){const thread=threadDetail(params.id,true,user.id,true);return thread?json(thread):error('Thread not found',404);}
    if(params&&method==='PATCH'){
      const row=db.threads.find((item)=>item.id===params.id);if(!row)return error('Thread not found',404);
      if(body.pinned!==undefined)row.pinned=body.pinned;if(body.locked!==undefined)row.locked=body.locked;save();return json(row);
    }
    params=match(path,'/api/admin/community/:classId/threads');
    if(params&&method==='POST'){
      const row=newThread(params.classId,user.id,body);row.pinned=Boolean(body.pinned);save();return json(row,201);
    }
    params=match(path,'/api/admin/community/thread/:id/replies');
    if(params&&method==='POST') return json(newReply(params.id,user.id,body),201);
    params=match(path,'/api/admin/community/thread/:id/removal');
    if(params&&method==='POST'){
      const row=db.threads.find((item)=>item.id===params.id);if(!row)return error('Thread not found',404);
      row.deleted_at=body.removed?new RealDate(PREVIEW_NOW).toISOString():null;save();return json(row);
    }
    params=match(path,'/api/admin/community/post/:id/removal');
    if(params&&method==='POST'){
      const row=db.posts.find((item)=>item.id===params.id);if(!row)return error('Reply not found',404);
      row.deleted_at=body.removed?new RealDate(PREVIEW_NOW).toISOString():null;save();return json(row);
    }

    if(path==='/api/student/community'&&method==='GET'){
      const student=previewStudent(user);
      return json({...boardPayload(student.class_id,false,student.id,url,false),unread:previewUnread(student)});
    }
    params=match(path,'/api/student/community/like/:type/:id');
    if(params&&method==='POST') return json(toggleLikeRow(previewStudent(user).id,params.type,params.id));
    if(path==='/api/student/community/read'&&method==='POST'){
      const student=previewStudent(user);
      updateOrInsert(db.reads,(item)=>item.user_id===student.id&&item.class_id===student.class_id,
        {user_id:student.id,class_id:student.class_id,last_seen_at:new RealDate(PREVIEW_NOW).toISOString()});
      save();return json({ok:true,unread:0});
    }
    params=match(path,'/api/student/community/thread/:id');
    if(params&&method==='GET'){const thread=threadDetail(params.id,false,previewStudent(user).id,false);return thread?json(thread):error('Post not found',404);}
    if(path==='/api/student/community/threads'&&method==='POST'){
      const student=previewStudent(user);
      return json(newThread(student.class_id,student.id,body),201);
    }
    params=match(path,'/api/student/community/thread/:id/replies');
    if(params&&method==='POST'){
      const thread=db.threads.find((item)=>item.id===params.id);
      if(!thread||thread.deleted_at)return error('Post not found',404);
      if(thread.locked)return error('This conversation has been closed to new replies.',409);
      return json(newReply(params.id,previewStudent(user).id,body),201);
    }

    return error(`Preview route not implemented: ${method} ${path}`,404);
  };

  window.GGPreview={
    switchRole(role){
      if(role==='login')db.sessionUserId=null;
      else if(role==='student')db.sessionUserId='s1';
      else db.sessionUserId='admin1';
      save();location.reload();
    },
    reset(){try { localStorage.removeItem(STORAGE_KEY); } catch {} db=seed(); location.reload();},
    role(){const user=currentUser();return user?.role||'login';}
  };

  document.addEventListener('DOMContentLoaded',()=>{
    const role=window.GGPreview.role();
    const consoleEl=document.createElement('div');
    consoleEl.className='preview-console';
    consoleEl.innerHTML=`<span class="preview-console-label">Operational preview</span>
      <button data-preview-role="login" class="${role==='login'?'active':''}">Login</button>
      <button data-preview-role="admin" class="${role==='admin'?'active':''}">Admin</button>
      <button data-preview-role="student" class="${role==='student'?'active':''}">Student</button>
      <span class="preview-separator"></span><button data-preview-reset>Reset data</button>`;
    document.body.append(consoleEl);
    consoleEl.querySelectorAll('[data-preview-role]').forEach((button)=>button.addEventListener('click',()=>window.GGPreview.switchRole(button.dataset.previewRole)));
    consoleEl.querySelector('[data-preview-reset]').addEventListener('click',()=>window.GGPreview.reset());
  });
})();
