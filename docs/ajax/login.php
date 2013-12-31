<?php

include('config.inc');
//include('common.php');

session_start();

$mysqli = new mysqli($sql_host, $sql_user, $sql_pass, $sql_db);

if (isset($_REQUEST['login_name'])) {
  $result = $mysqli->query("SELECT * from users WHERE username = '".$_REQUEST['login_name']."' AND password = '". md5($_REQUEST['login_pw']). "'");
  if ($result && $row = $result->fetch_assoc()) {
    $_SESSION['user'] = $row;
//    $result = $mysqli->query("INSERT into event_log set user_id = '".$row['user_id']."', event_type = '".EVENT_TYPE_LOGIN."'");
//    header('Location: '.$_SERVER['PHP_SELF']);
    exit();
  }
}

header('HTTP/1.0 401 Unauthorized');
exit();

?>
