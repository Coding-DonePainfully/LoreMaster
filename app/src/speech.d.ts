interface SpeechRecognitionResult { readonly 0: SpeechRecognitionAlternative; readonly length: number; isFinal: boolean; }
interface SpeechRecognitionResultList { readonly length: number; readonly [index: number]: SpeechRecognitionResult; }
interface SpeechRecognitionEvent extends Event { readonly results: SpeechRecognitionResultList; }
interface SpeechRecognition extends EventTarget { lang:string; interimResults:boolean; onstart:((this:SpeechRecognition,ev:Event)=>unknown)|null; onend:((this:SpeechRecognition,ev:Event)=>unknown)|null; onerror:((this:SpeechRecognition,ev:Event)=>unknown)|null; onresult:((this:SpeechRecognition,ev:SpeechRecognitionEvent)=>unknown)|null; start():void; stop():void; }
