import com.sun.jdi.*;
import com.sun.jdi.connect.*;
import com.sun.jdi.event.*;
import com.sun.jdi.request.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Standalone JDI bridge. No debuggee method invocation, evaluation or mutation. */
public final class DebuggerWorker {
  static final int MAX_LINE = 1048576;
  final Object lock = new Object();
  VirtualMachine vm;
  final Map<String, Map<String,Object>> breaks = new LinkedHashMap<>();
  final Map<String, StackFrame> frames = new HashMap<>();
  final Map<String, ThreadReference> threads = new HashMap<>();
  final List<EventSet> held = new ArrayList<>();
  String stopId;
  long attachedAt, pausedAt, activityAt;
  boolean closed;
  StepRequest step;
  final ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(r -> { Thread t=new Thread(r,"debugger-watchdog"); t.setDaemon(true); return t; });
  static Map<String,Object> obj(Object... pairs) { Map<String,Object> m=new LinkedHashMap<>(); for(int i=0;i<pairs.length;i+=2)m.put((String)pairs[i],pairs[i+1]);return m; }
  static synchronized void send(Object o) { System.out.println(Json.write(o)); System.out.flush(); }
  static String str(Map<String,Object> m,String k) { Object v=m.get(k); return v==null?"":v.toString(); }
  static int num(Map<String,Object> m,String k,int d) { Object v=m.get(k);return v instanceof Number?((Number)v).intValue():d; }
  static RuntimeException fail(String code) { return new IllegalStateException(code); }
  void active() { if(vm==null || closed)throw fail("DEBUGGER_DISCONNECTED"); }
  void paused(Map<String,Object> a) { active();if(stopId==null)throw fail("DEBUGGER_NOT_PAUSED");if(!stopId.equals(str(a,"stopId")))throw fail("DEBUGGER_STALE_REFERENCE"); }
  void invalidate() { stopId=null;frames.clear();threads.clear();pausedAt=0; }
  void cancelStep() { if(step!=null){try{vm.eventRequestManager().deleteEventRequest(step);}catch(RuntimeException ignored){}step=null;} }
  void release() { for(EventSet s:held)s.resume();held.clear();invalidate(); }
  Map<String,Object> location(Location l) { String source=null;try{source=l.sourceName();}catch(AbsentInformationException ignored){}return obj("class_name",l.declaringType().name(),"method",l.method().name(),"source",source,"line",l.lineNumber(),"code_index",l.codeIndex(),"class_loader_id",l.declaringType().classLoader()==null?"bootstrap":String.valueOf(l.declaringType().classLoader().uniqueID())); }
  String thread(ThreadReference t) { String id=stopId+":"+t.uniqueID();threads.put(id,t);return id; }
  Map<String,Object> state() {return obj("state",closed?"detached":stopId==null?"running":"paused","stop_id",stopId,"breakpoints",new ArrayList<>(breaks.values()));}
  void bind(Map<String,Object> b,ReferenceType type) {
    try {
      List<Location> ls=type.locationsOfLine(((Number)b.get("line")).intValue());
      if(ls.isEmpty()){ if(!"verified".equals(b.get("status")))b.put("status","rejected"); b.put("reason","DEBUGGER_LOCATION_UNAVAILABLE");return; }
      @SuppressWarnings("unchecked") List<Object> locations=(List<Object>)b.get("locations");
      for(Location l:ls){
        Map<String,Object> loc=location(l); if(locations.contains(loc))continue;
        BreakpointRequest req=vm.eventRequestManager().createBreakpointRequest(l);req.putProperty("id",b.get("breakpoint_id"));req.setSuspendPolicy(EventRequest.SUSPEND_ALL);req.enable();locations.add(loc);
      }
      b.put("status","verified");b.remove("reason");
    } catch(AbsentInformationException e){if(!"verified".equals(b.get("status")))b.put("status","rejected");b.put("reason","DEBUGGER_LOCATION_UNAVAILABLE");}
  }
  void eventLoop() {
    try {
      while(!closed){
        EventSet set=vm.eventQueue().remove(200);
        if(set==null)continue;
        synchronized(lock){
          if(closed)break;
          List<Object> stops=new ArrayList<>();ThreadReference trigger=null;Set<ReferenceType> prepared=new HashSet<>();
          for(Event event:set){
            if(event instanceof VMDeathEvent || event instanceof VMDisconnectEvent){finish("process_exit");return;}
            if(event instanceof ClassPrepareEvent c && prepared.add(c.referenceType())){ for(Map<String,Object>b:breaks.values())if(!"removed".equals(b.get("status")) && b.get("className").equals(c.referenceType().name())){bind(b,c.referenceType());send(obj("event","breakpoint","breakpoint",b));} }
            if(event instanceof BreakpointEvent b){trigger=b.thread();stops.add(obj("reason","breakpoint","location",location(b.location()),"breakpoint_id",b.request().getProperty("id")));}
            if(event instanceof StepEvent s){trigger=s.thread();stops.add(obj("reason","step","location",location(s.location())));}
          }
          if(!stops.isEmpty()){
            cancelStep();held.add(set);
            // Additional simultaneously suspended sets belong to the same epoch.
            if(stopId==null){stopId=UUID.randomUUID().toString();pausedAt=System.nanoTime();}
            send(obj("event","stopped","state","paused","stop_id",stopId,"thread_id",thread(trigger),"stops",stops));
          }else set.resume();
        }
      }
    }catch(InterruptedException e){Thread.currentThread().interrupt();}catch(RuntimeException e){synchronized(lock){finish("transport_lost");}}
  }
  void finish(String reason) {
    if(closed)return;
    boolean clean=true;
    try{if(vm!=null){cancelStep();vm.dispose();}}catch(VMDisconnectedException ignored){}catch(RuntimeException e){clean=false;}
    closed=true;held.clear();invalidate();
    send(obj("event","terminated","reason",reason,"cleanup_complete",clean,"execution_state","unknown"));
  }
  Object command(Map<String,Object> a) throws Exception {
    String cmd=str(a,"command");activityAt=System.nanoTime();
    if(cmd.equals("attach")){
      if(vm!=null)throw fail("DEBUGGER_BUSY");
      AttachingConnector c=Bootstrap.virtualMachineManager().attachingConnectors().stream().filter(x->x.name().equals("com.sun.jdi.SocketAttach")).findFirst().orElseThrow();
      Map<String,Connector.Argument> args=c.defaultArguments();args.get("hostname").setValue("127.0.0.1");args.get("port").setValue(str(a,"port"));args.get("timeout").setValue(str(a,"timeoutMs"));
      vm=c.attach(args);attachedAt=System.nanoTime();
      Thread t=new Thread(this::eventLoop,"debugger-events");t.setDaemon(true);t.start();
      return state();
    }
    if(cmd.equals("detach")){finish("requested");return state();}
    active();
    if(cmd.equals("heartbeat"))return obj("alive",true);
    if(cmd.equals("state"))return state();
    if(cmd.equals("set")){
      if(breaks.size()>=100)throw fail("DEBUGGER_BUSY");
      String id=UUID.randomUUID().toString();Map<String,Object>b=obj("breakpoint_id",id,"className",str(a,"className"),"line",num(a,"line",0),"status","pending","locations",new ArrayList<>());
      breaks.put(id,b);
      ClassPrepareRequest req=vm.eventRequestManager().createClassPrepareRequest();req.addClassFilter(str(a,"className"));req.putProperty("id",id);req.setSuspendPolicy(EventRequest.SUSPEND_ALL);req.enable();
      for(ReferenceType type:vm.classesByName(str(a,"className")))bind(b,type);
      return b;
    }
    if(cmd.equals("remove")){
      String id=str(a,"breakpointId");
      if(!breaks.containsKey(id))throw fail("DEBUGGER_NOT_FOUND");
      for(EventRequest r:new ArrayList<EventRequest>(vm.eventRequestManager().breakpointRequests()))if(id.equals(r.getProperty("id")))vm.eventRequestManager().deleteEventRequest(r);
      for(EventRequest r:new ArrayList<EventRequest>(vm.eventRequestManager().classPrepareRequests()))if(id.equals(r.getProperty("id")))vm.eventRequestManager().deleteEventRequest(r);
      breaks.get(id).put("status","removed");return obj("removed",true);
    }
    paused(a);
    if(cmd.equals("stack")){
      ThreadReference t=threads.get(str(a,"threadId"));if(t==null)throw fail("DEBUGGER_STALE_REFERENCE");
      int count=Math.min(t.frameCount(),1000),offset=num(a,"offset",0),end=Math.min(count,offset+num(a,"limit",20));List<Object> out=new ArrayList<>();
      for(int i=offset;i<end;i++){StackFrame f=t.frame(i);String id=stopId+":"+t.uniqueID()+":"+i;if(!frames.containsKey(id)&&frames.size()>=1000)throw fail("DEBUGGER_BUSY");frames.put(id,f);out.add(obj("frame_id",id,"index",i,"location",location(f.location())));}
      return obj("frames",out,"next_offset",end<count?end:null,"truncated",t.frameCount()>1000);
    }
    if(cmd.equals("locals")){
      StackFrame f=frames.get(str(a,"frameId"));if(f==null)throw fail("DEBUGGER_STALE_REFERENCE");List<Object> out=new ArrayList<>();
      try{List<LocalVariable> vars=f.visibleVariables();if(vars.isEmpty())return obj("availability","unknown","reason","EMPTY_OR_UNAVAILABLE_VARIABLE_METADATA","locals",out,"truncated",false);for(LocalVariable v:vars.subList(0,Math.min(vars.size(),100))){Value value=f.getValue(v);Object display=null;boolean truncated=false;
        if(value instanceof StringReference s){String text=s.value();truncated=text.length()>256;display=text.substring(0,Math.min(text.length(),256));}
        else if(value instanceof PrimitiveValue)display=value.toString();
        else if(value instanceof ObjectReference o)display=obj("object_id",String.valueOf(o.uniqueID()),"type",o.referenceType().name());
        out.add(obj("name",v.name(),"type",v.typeName(),"value",display,"truncated",truncated));}
        return obj("availability","available","locals",out,"truncated",vars.size()>100);
      }catch(AbsentInformationException e){return obj("availability","debug_metadata_unavailable","locals",out,"truncated",false);}
    }
    if(cmd.equals("resume") || cmd.equals("step")){
      if(cmd.equals("step")){
        ThreadReference t=threads.get(str(a,"threadId"));if(t==null)throw fail("DEBUGGER_STALE_REFERENCE");cancelStep();
        int depth=switch(str(a,"kind")){case "into"->StepRequest.STEP_INTO;case "over"->StepRequest.STEP_OVER;case "out"->StepRequest.STEP_OUT;default->throw fail("INVALID_ARGUMENT");};
        step=vm.eventRequestManager().createStepRequest(t,StepRequest.STEP_LINE,depth);step.addCountFilter(1);step.setSuspendPolicy(EventRequest.SUSPEND_ALL);step.enable();
      }else cancelStep();
      release();return state();
    }
    throw fail("INVALID_ARGUMENT");
  }
  void run() throws IOException {
    watchdog.scheduleAtFixedRate(()->{synchronized(lock){if(vm==null||closed)return;long now=System.nanoTime();String reason=pausedAt!=0&&now-pausedAt>=TimeUnit.SECONDS.toNanos(60)?"pause_limit":now-activityAt>=TimeUnit.MINUTES.toNanos(5)?"idle_limit":now-attachedAt>=TimeUnit.MINUTES.toNanos(30)?"session_limit":null;if(reason!=null)finish(reason);}},1,1,TimeUnit.SECONDS);
    Runtime.getRuntime().addShutdownHook(new Thread(()->{synchronized(lock){finish("worker_shutdown");}}));
    try(Reader reader=new InputStreamReader(System.in,StandardCharsets.UTF_8)){
      StringBuilder line=new StringBuilder();int ch;
      while((ch=reader.read())!=-1){if(ch!='\n'){line.append((char)ch);if(line.length()>MAX_LINE)throw new IOException("IPC_LIMIT");continue;}
        Object id=null;
        try{@SuppressWarnings("unchecked") Map<String,Object>a=(Map<String,Object>)new Json(line.toString()).value();id=a.get("id");synchronized(lock){Object result=command(a);send(obj("id",id,"result",result));}}
        catch(Exception e){String msg=e.getMessage();String code=msg!=null&&msg.matches("(?:DEBUGGER|INVALID|PROCESS|DEVICE)_[A-Z_]+")?msg:e instanceof VMDisconnectedException?"DEBUGGER_DISCONNECTED":"DEBUGGER_WORKER_FAILED";send(obj("id",id,"error",obj("code",code)));}
        line.setLength(0);
      }
    }finally{synchronized(lock){finish("parent_closed");}watchdog.shutdownNow();}
  }
  public static void main(String[] args) throws Exception {new DebuggerWorker().run();}

  // Small strict JSON codec for the bounded, whitelisted bridge protocol.
  static final class Json {
    final String s;int p;Json(String s){this.s=s;}
    void ws(){while(p<s.length()&&Character.isWhitespace(s.charAt(p)))p++;}
    Object value(){Object v=read();ws();if(p!=s.length())throw fail("INVALID_ARGUMENT");return v;}
    Object read(){ws();char c=s.charAt(p++);if(c=='"')return string();if(c=='{'){Map<String,Object>m=new LinkedHashMap<>();ws();if(s.charAt(p)=='}'){p++;return m;}do{ws();if(s.charAt(p++)!='"')throw fail("INVALID_ARGUMENT");String k=string();ws();if(s.charAt(p++)!=':')throw fail("INVALID_ARGUMENT");m.put(k,read());ws();c=s.charAt(p++);}while(c==',');if(c!='}')throw fail("INVALID_ARGUMENT");return m;}if(c=='['){List<Object>l=new ArrayList<>();ws();if(s.charAt(p)==']'){p++;return l;}do{l.add(read());ws();c=s.charAt(p++);}while(c==',');if(c!=']')throw fail("INVALID_ARGUMENT");return l;}p--;for(String lit:List.of("true","false","null"))if(s.startsWith(lit,p)){p+=lit.length();return lit.equals("null")?null:Boolean.valueOf(lit);}int start=p;while(p<s.length()&&"-+0123456789.eE".indexOf(s.charAt(p))>=0)p++;String number=s.substring(start,p);if(number.indexOf('.')<0&&number.indexOf('e')<0&&number.indexOf('E')<0)return Long.valueOf(number);return Double.valueOf(number);}
    String string(){StringBuilder b=new StringBuilder();while(p<s.length()){char c=s.charAt(p++);if(c=='"')return b.toString();if(c=='\\'){c=s.charAt(p++);c=switch(c){case 'n'->'\n';case 'r'->'\r';case 't'->'\t';case 'b'->'\b';case 'f'->'\f';case 'u'->{char u=(char)Integer.parseInt(s.substring(p,p+4),16);p+=4;yield u;}case '"','\\','/'->c;default->throw fail("INVALID_ARGUMENT");};}else if(c<32)throw fail("INVALID_ARGUMENT");b.append(c);}throw fail("INVALID_ARGUMENT");}
    static String write(Object o){if(o==null)return "null";if(o instanceof String s){StringBuilder b=new StringBuilder("\"");for(char c:s.toCharArray()){switch(c){case '"'->b.append("\\\"");case '\\'->b.append("\\\\");case '\n'->b.append("\\n");case '\r'->b.append("\\r");case '\t'->b.append("\\t");default->{if(c<32||Character.isSurrogate(c))b.append(String.format("\\u%04x",(int)c));else b.append(c);}}}return b.append('"').toString();}if(o instanceof Map<?,?>m){List<String>l=new ArrayList<>();m.forEach((k,v)->l.add(write(k.toString())+":"+write(v)));return "{"+String.join(",",l)+"}";}if(o instanceof Collection<?>l){List<String>a=new ArrayList<>();l.forEach(v->a.add(write(v)));return "["+String.join(",",a)+"]";}return o.toString();}
  }
}
