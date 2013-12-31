<?php
define("EVENT_TYPE_LOGIN", 0);
define("EVENT_TYPE_OPEN_WILSON_GATE", 1);
define("EVENT_TYPE_HOLD_WILSON_GATE", 2);
define("EVENT_TYPE_RELEASE_WILSON_GATE", 3);
define("EVENT_TYPE_OPEN_BRIGMAN_GATE", 4);
define("EVENT_TYPE_HOLD_BRIGMAN_GATE", 5);
define("EVENT_TYPE_RELEASE_BRIGMAN_GATE", 6);

function split_filename($filename)
{
    $pos = strrpos($filename, '.');
    if ($pos === false) {
        // dot is not found in the filename
        return array($filename, ''); // no extension
    } else {
        $basename = substr($filename, 0, $pos);
        $extension = substr($filename, $pos+1);
        return array($basename, $extension);
    }
}

function maybe_display_login($mysqli, $smarty) {
	if (!isset($_SESSION['user'])) {
        	$smarty->display('templates/login.tpl');
        	exit();
	}

	if (isset($_REQUEST['new_username']) && isset($_SESSION['user']) && $_SESSION['user']['username'] == 'knobby') {
        	$query = 'INSERT into users SET username="'.$_REQUEST['new_username'].'", password = "'.md5($_REQUEST['new_pw']).'", access_level="1"';
        	$result = $mysqli->query($query) or die("Unable to query database - $query");
        	$smarty->assign('info', 'Added.');
	}
}

function delete_old_videos($mysqli) {
        $delete_date = date('YmdHis', strtotime("-2 months"));

        $query = 'SELECT security_events.event_id, filename, file_type FROM security_file LEFT JOIN security_events ON security_events.event_id = security_file.event_id WHERE deleted="1" AND event_time_stamp < '.$delete_date;
        $result = $mysqli->query($query) or die("Unable to query database - $query");
        while ($row = $result->fetch_assoc()) {
                $ar = split_filename($row['filename']);
                unlink($row['filename']);
                if ($row['file_type'] == 8) {
                        // movie
                        unlink($ar[0].".webm");
                        unlink($ar[0].".ipad.mp4");
                } else {
                        // must be a jpeg
                        unlink($ar[0].".thumb.jpg");
                }

	        $query = 'DELETE FROM security_file WHERE event_id = "'.$row['event_id'].'"';
        	$new_result = $mysqli->query($query) or die("Unable to query database - $query");

	        $query = 'DELETE FROM security_events WHERE event_id = "'.$row['event_id'].'"';
        	$new_result = $mysqli->query($query) or die("Unable to query database - $query");
        }
}

function handle_user_login($mysqli, $smarty)
{
	if (isset($_REQUEST['login_name'])) {
	        $result = $mysqli->query("SELECT * from users WHERE username = '".$_REQUEST['login_name']."' AND password = '". md5($_REQUEST['login_pw']). "'");
	        if ($result && $row = $result->fetch_assoc()) {
	                $_SESSION['user'] = $row;
	                $result = $mysqli->query("INSERT into event_log set user_id = '".$row['user_id']."', event_type = '".EVENT_TYPE_LOGIN."'");
	                header('Location: '.$_SERVER['PHP_SELF']);
	                exit();
	        } else {
	                $smarty->assign('info', 'Unable to authorize.');
	        }
	}
}
?>
